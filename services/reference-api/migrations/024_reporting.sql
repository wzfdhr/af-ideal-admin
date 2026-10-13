CREATE FUNCTION af_record_visible(subject_tenant text,subject_user text,subject_record text) RETURNS boolean LANGUAGE SQL STABLE AS $$
 WITH capabilities AS MATERIALIZED (
  SELECT af_effective_permissions(subject_tenant,subject_user) AS codes
  WHERE EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE m.tenant_id=subject_tenant AND m.user_id=subject_user AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND t.status='enabled')
 ), candidate AS (
  SELECT r.*,CASE WHEN r.record_kind='leave' THEN 'leave:read:self' ELSE 'business:read:self' END AS read_code FROM business_records r WHERE r.tenant_id=subject_tenant AND r.id=subject_record
 ), rights AS (
  SELECT r.*,(c.codes ? r.read_code OR c.codes ? '*') AS can_read,(c.codes ? 'workflow:todo' OR c.codes ? 'workflow:approve' OR c.codes ? 'workflow:reject' OR c.codes ? '*') AS can_review FROM candidate r CROSS JOIN capabilities c
 )
 SELECT EXISTS(SELECT 1 FROM rights r WHERE
  (r.can_read AND r.applicant_id=subject_user)
  OR (r.can_review AND EXISTS(SELECT 1 FROM workflow_tasks task JOIN workflow_instances instance ON instance.tenant_id=task.tenant_id AND instance.id=task.instance_id WHERE instance.tenant_id=r.tenant_id AND instance.request_id=r.id AND (task.assignee_id=subject_user OR EXISTS(SELECT 1 FROM workflow_assignment_events e WHERE e.tenant_id=task.tenant_id AND e.instance_id=task.instance_id AND e.task_id=task.id AND (e.from_user_id=subject_user OR e.to_user_id=subject_user)))))
  OR ((r.can_read OR r.can_review) AND EXISTS(SELECT 1 FROM outbox o WHERE o.tenant_id=r.tenant_id AND o.recipient_id=subject_user AND o.payload->>'requestId'=r.id AND o.payload->>'access'='copy'))
 )
$$;

CREATE TABLE report_definitions (
 tenant_id text NOT NULL REFERENCES tenants(id),id text NOT NULL,draft_schema jsonb NOT NULL CHECK(jsonb_typeof(draft_schema)='object'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),draft_revision integer NOT NULL DEFAULT 1 CHECK(draft_revision>0),enabled boolean NOT NULL DEFAULT true,active_version_id text,
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id)
);
CREATE TABLE report_definition_versions (
 tenant_id text NOT NULL,id text NOT NULL,definition_id text NOT NULL,version integer NOT NULL CHECK(version>0),draft_revision integer NOT NULL CHECK(draft_revision>0),
 schema_snapshot jsonb NOT NULL CHECK(jsonb_typeof(schema_snapshot)='object'),source_application_id text NOT NULL,source_release_id text NOT NULL,source_release_version integer NOT NULL CHECK(source_release_version>0),
 field_bindings jsonb NOT NULL CHECK(jsonb_typeof(field_bindings)='object'),content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 published_by text NOT NULL,published_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,definition_id,id),UNIQUE(tenant_id,definition_id,version),
 FOREIGN KEY(tenant_id,definition_id) REFERENCES report_definitions(tenant_id,id),
 FOREIGN KEY(tenant_id,source_application_id,source_release_id) REFERENCES application_releases(tenant_id,application_id,id),
 FOREIGN KEY(tenant_id,published_by) REFERENCES memberships(tenant_id,user_id)
);
ALTER TABLE report_definitions ADD FOREIGN KEY(tenant_id,id,active_version_id) REFERENCES report_definition_versions(tenant_id,definition_id,id);
CREATE FUNCTION af_report_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Report definition identity is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER report_identity_immutable BEFORE UPDATE ON report_definitions FOR EACH ROW EXECUTE FUNCTION af_report_identity_immutable();
CREATE TRIGGER report_no_physical_delete BEFORE DELETE ON report_definitions FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE FUNCTION af_report_version_valid() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE source_version integer;source_kind text;source_status text;source_active text;draft jsonb;draft_revision integer;BEGIN
 SELECT ar.release_version,a.business_kind,a.status,a.active_release_id INTO source_version,source_kind,source_status,source_active FROM application_releases ar JOIN applications a ON a.tenant_id=ar.tenant_id AND a.id=ar.application_id WHERE ar.tenant_id=NEW.tenant_id AND ar.id=NEW.source_release_id AND ar.application_id=NEW.source_application_id;
 SELECT d.draft_schema,d.draft_revision INTO draft,draft_revision FROM report_definitions d WHERE d.tenant_id=NEW.tenant_id AND d.id=NEW.definition_id;
 IF source_version IS DISTINCT FROM NEW.source_release_version OR source_kind IS DISTINCT FROM 'generic' OR source_status IS DISTINCT FROM 'enabled' OR source_active IS DISTINCT FROM NEW.source_release_id
  OR draft IS DISTINCT FROM NEW.schema_snapshot OR draft_revision IS DISTINCT FROM NEW.draft_revision
  OR NEW.schema_snapshot->>'version' IS DISTINCT FROM '1' OR NEW.schema_snapshot->>'metric' IS DISTINCT FROM 'count' OR NEW.schema_snapshot->>'factTime' IS DISTINCT FROM 'createdAt'
  OR NEW.schema_snapshot->'source'->>'kind' IS DISTINCT FROM 'application-records' OR NEW.schema_snapshot->'source'->>'applicationId' IS DISTINCT FROM NEW.source_application_id
 THEN RAISE EXCEPTION 'Report version must fix the current valid source and actual draft' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER report_version_valid BEFORE INSERT ON report_definition_versions FOR EACH ROW EXECUTE FUNCTION af_report_version_valid();
CREATE TRIGGER report_version_immutable BEFORE UPDATE OR DELETE ON report_definition_versions FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE INDEX report_definition_created ON report_definitions(tenant_id,created_by,updated_at);

INSERT INTO permission_definitions(code,title,module) VALUES
('report:list','查看报表配置','真实报表'),('report:create','创建报表','真实报表'),('report:update','编辑报表草稿','真实报表'),('report:publish','发布报表快照','真实报表'),
('report:disable','启停报表','真实报表'),('report:query','查询授权报表','真实报表'),('report:field:applicant','读取报表申请人字段','真实报表'),('report:field:business','读取报表业务字段','真实报表');
INSERT INTO menu_route_catalogue(key,path,component_key,parent_key,locale,permissions,permission_mode,menu_type,default_order,protected) VALUES
('visualization','/visualization','DefaultLayout',NULL,'menu.visualization','[]'::jsonb,'any','catalog',1,false),
('reportCenter','/visualization/reportCenter','ReportCenterPage','visualization','menu.visualization.reportCenter','["report:list","report:query"]'::jsonb,'any','menu',0,false);
INSERT INTO menu_resources(tenant_id,id,menu_name,menu_type,route_key,parent_id,sort)
 SELECT t.id,'default-'||r.key,r.locale,r.menu_type,r.key,CASE WHEN r.parent_key IS NULL THEN NULL ELSE 'default-'||r.parent_key END,r.default_order
 FROM tenants t CROSS JOIN menu_route_catalogue r WHERE r.key IN('visualization','reportCenter');

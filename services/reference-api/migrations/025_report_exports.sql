CREATE TABLE report_export_jobs (
 tenant_id text NOT NULL,id text NOT NULL,definition_id text NOT NULL,definition_version_id text NOT NULL,
 source_application_id text NOT NULL,source_release_id text NOT NULL,source_release_version integer NOT NULL CHECK(source_release_version>0),
 created_by text NOT NULL,report_name text NOT NULL,format text NOT NULL CHECK(format IN('csv','xlsx','pdf')),
 query jsonb NOT NULL CHECK(jsonb_typeof(query)='object'),snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),field_bindings jsonb NOT NULL CHECK(jsonb_typeof(field_bindings)='object'),
 authorization_manifest jsonb NOT NULL CHECK(jsonb_typeof(authorization_manifest)='array'),object_key text NOT NULL UNIQUE CHECK(object_key ~ '^[a-f0-9]{64}$'),
 total_rows integer NOT NULL CHECK(total_rows BETWEEN 0 AND 2000),processed_rows integer NOT NULL DEFAULT 0 CHECK(processed_rows BETWEEN 0 AND total_rows),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','completed','failed','blocked','cancelled','infected')),
 stage text NOT NULL DEFAULT 'queued' CHECK(stage IN('queued','rendering','scanning','completed','stopped')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),claimed_by text,lease_until timestamptz,error_code text,error_message text,
 artifact_id text,archived_at timestamptz,retention_until timestamptz NOT NULL DEFAULT(now()+interval '7 days'),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,id,object_key),
 FOREIGN KEY(tenant_id,definition_id,definition_version_id) REFERENCES report_definition_versions(tenant_id,definition_id,id),
 FOREIGN KEY(tenant_id,source_application_id,source_release_id) REFERENCES application_releases(tenant_id,application_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),
 CHECK(jsonb_array_length(snapshot->'rows')=total_rows AND jsonb_array_length(authorization_manifest)=total_rows),
 CHECK(octet_length(snapshot::text)+octet_length(authorization_manifest::text)<=2097152),
 CHECK((status='processing')=(claimed_by IS NOT NULL AND lease_until IS NOT NULL)),
 CHECK((status='processing' AND stage IN('rendering','scanning')) OR (status='queued' AND stage='queued') OR (status='completed' AND stage='completed') OR (status IN('failed','blocked','cancelled','infected') AND stage='stopped'))
);
CREATE TABLE report_export_artifacts (
 tenant_id text NOT NULL,id text NOT NULL,job_id text NOT NULL,object_key text NOT NULL,
 file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 120 AND file_name !~ '[[:cntrl:]/\\]'),mime_type text NOT NULL,
 size integer NOT NULL CHECK(size BETWEEN 1 AND 10485760),sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 status text NOT NULL CHECK(status IN('ready','quarantined','expired')),scan_engine text NOT NULL CHECK(scan_engine LIKE 'ClamAV %'),
 scanned_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,expired_at timestamptz,purged_at timestamptz,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id),UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,object_key) REFERENCES report_export_jobs(tenant_id,id,object_key),
 CHECK((status='expired')=(expired_at IS NOT NULL)),CHECK(purged_at IS NULL OR status='expired')
);
ALTER TABLE report_export_jobs ADD FOREIGN KEY(tenant_id,id,artifact_id) REFERENCES report_export_artifacts(tenant_id,job_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE report_export_events (
 tenant_id text NOT NULL,id text NOT NULL,job_id text NOT NULL,action text NOT NULL,actor_id text,actor_name text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(detail)='object'),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,job_id) REFERENCES report_export_jobs(tenant_id,id),FOREIGN KEY(tenant_id,actor_id) REFERENCES memberships(tenant_id,user_id)
);
CREATE FUNCTION af_report_export_plan_valid() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE v report_definition_versions;BEGIN
 SELECT * INTO v FROM report_definition_versions WHERE tenant_id=NEW.tenant_id AND id=NEW.definition_version_id;
 IF v.definition_id IS DISTINCT FROM NEW.definition_id OR v.source_application_id IS DISTINCT FROM NEW.source_application_id OR v.source_release_id IS DISTINCT FROM NEW.source_release_id OR v.source_release_version IS DISTINCT FROM NEW.source_release_version OR v.field_bindings IS DISTINCT FROM NEW.field_bindings
  OR NEW.snapshot->'schema' IS DISTINCT FROM v.schema_snapshot OR NEW.report_name IS DISTINCT FROM v.schema_snapshot->>'name' OR NEW.snapshot->>'definitionId' IS DISTINCT FROM NEW.definition_id OR NEW.snapshot->>'definitionVersionId' IS DISTINCT FROM NEW.definition_version_id OR NEW.snapshot->>'definitionVersion' IS DISTINCT FROM v.version::text OR NEW.snapshot->>'sourceReleaseId' IS DISTINCT FROM NEW.source_release_id OR NEW.snapshot->>'sourceReleaseVersion' IS DISTINCT FROM NEW.source_release_version::text OR NEW.snapshot->'query' IS DISTINCT FROM NEW.query OR NEW.snapshot->>'version' IS DISTINCT FROM '1' OR NEW.snapshot->>'policyVersion' IS DISTINCT FROM '1' OR NEW.snapshot->>'total' IS DISTINCT FROM NEW.total_rows::text
 THEN RAISE EXCEPTION 'Export requires a trusted fixed published report snapshot' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(NEW.snapshot->'columns') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.snapshot->'columns')=0
  OR (SELECT count(DISTINCT value->>'key') FROM jsonb_array_elements(NEW.snapshot->'columns'))<>jsonb_array_length(NEW.snapshot->'columns')
  OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(NEW.snapshot->'rows'))<>NEW.total_rows
  OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(NEW.authorization_manifest))<>NEW.total_rows
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.snapshot->'rows') WITH ORDINALITY row_fact(value,ordinal) JOIN jsonb_array_elements(NEW.authorization_manifest) WITH ORDINALITY identity(value,ordinal) USING(ordinal)
   LEFT JOIN business_records r ON r.tenant_id=NEW.tenant_id AND r.id=row_fact.value->>'id'
   WHERE identity.value->>'id' IS DISTINCT FROM row_fact.value->>'id' OR identity.value->>'applicantId' IS DISTINCT FROM r.applicant_id OR r.id IS NULL OR r.application_release_id IS DISTINCT FROM NEW.source_release_id
    OR jsonb_typeof(identity.value->'allowedFieldKeys') IS DISTINCT FROM 'array'
    OR jsonb_typeof(row_fact.value->'values') IS DISTINCT FROM 'object'
    OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(identity.value->'allowedFieldKeys'))<>jsonb_array_length(identity.value->'allowedFieldKeys')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(identity.value->'allowedFieldKeys') permitted(value) WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.snapshot->'columns') column_fact WHERE column_fact->>'key'=permitted.value) OR COALESCE(row_fact.value->'hiddenFieldKeys','[]'::jsonb) ? permitted.value)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.snapshot->'columns') column_fact WHERE NOT(identity.value->'allowedFieldKeys' ? (column_fact->>'key')) AND NOT(COALESCE(row_fact.value->'hiddenFieldKeys','[]'::jsonb) ? (column_fact->>'key'))))
 THEN RAISE EXCEPTION 'Export manifest must exactly match unique captured rows and captured columns' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER report_export_plan_valid BEFORE INSERT ON report_export_jobs FOR EACH ROW EXECUTE FUNCTION af_report_export_plan_valid();
CREATE FUNCTION af_report_export_job_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.definition_id,NEW.definition_version_id,NEW.source_application_id,NEW.source_release_id,NEW.source_release_version,NEW.created_by,NEW.report_name,NEW.format,NEW.query,NEW.snapshot,NEW.snapshot_hash,NEW.field_bindings,NEW.authorization_manifest,NEW.object_key,NEW.total_rows,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.definition_id,OLD.definition_version_id,OLD.source_application_id,OLD.source_release_id,OLD.source_release_version,OLD.created_by,OLD.report_name,OLD.format,OLD.query,OLD.snapshot,OLD.snapshot_hash,OLD.field_bindings,OLD.authorization_manifest,OLD.object_key,OLD.total_rows,OLD.created_at)
 THEN RAISE EXCEPTION 'Export planning identity is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status IN('completed','infected','cancelled') AND ROW(NEW.status,NEW.stage,NEW.artifact_id,NEW.completed_at,NEW.processed_rows,NEW.attempts,NEW.error_code,NEW.error_message) IS DISTINCT FROM ROW(OLD.status,OLD.stage,OLD.artifact_id,OLD.completed_at,OLD.processed_rows,OLD.attempts,OLD.error_code,OLD.error_message)
 THEN RAISE EXCEPTION 'Terminal export facts are immutable' USING ERRCODE='23514'; END IF;
 IF OLD.artifact_id IS NOT NULL AND NEW.artifact_id IS DISTINCT FROM OLD.artifact_id THEN RAISE EXCEPTION 'Export artifact cannot be replaced' USING ERRCODE='23514'; END IF;
 IF NEW.retention_until IS DISTINCT FROM (NEW.created_at+CASE WHEN NEW.archived_at IS NULL THEN interval '7 days' ELSE interval '365 days' END) THEN RAISE EXCEPTION 'Export retention is fixed to creation time' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER report_export_job_guard BEFORE UPDATE ON report_export_jobs FOR EACH ROW EXECUTE FUNCTION af_report_export_job_guard();
CREATE FUNCTION af_report_export_artifact_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.job_id,NEW.object_key,NEW.file_name,NEW.mime_type,NEW.size,NEW.sha256,NEW.scan_engine,NEW.scanned_at,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.job_id,OLD.object_key,OLD.file_name,OLD.mime_type,OLD.size,OLD.sha256,OLD.scan_engine,OLD.scanned_at,OLD.created_at)
 THEN RAISE EXCEPTION 'Verified export bytes and scan facts are immutable' USING ERRCODE='23514'; END IF;
 IF NEW.status<>OLD.status AND NEW.status<>'expired' THEN RAISE EXCEPTION 'Export quarantine/expiry cannot be reversed' USING ERRCODE='23514'; END IF;
 IF OLD.expired_at IS NOT NULL AND NEW.expired_at IS DISTINCT FROM OLD.expired_at THEN RAISE EXCEPTION 'Export expiry facts are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER report_export_artifact_guard BEFORE UPDATE ON report_export_artifacts FOR EACH ROW EXECUTE FUNCTION af_report_export_artifact_guard();
CREATE FUNCTION af_report_export_completion_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE artifact report_export_artifacts;BEGIN
 IF NEW.status IN('completed','infected') THEN
  SELECT * INTO artifact FROM report_export_artifacts WHERE tenant_id=NEW.tenant_id AND job_id=NEW.id AND id=NEW.artifact_id;
  IF artifact.id IS NULL OR (NEW.status='completed' AND artifact.status NOT IN('ready','expired')) OR (NEW.status='infected' AND artifact.status NOT IN('quarantined','expired')) OR NEW.completed_at IS NULL OR NEW.processed_rows<>NEW.total_rows THEN RAISE EXCEPTION 'Export completion requires canonical verified artifact' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER report_export_completion_guard AFTER INSERT OR UPDATE ON report_export_jobs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION af_report_export_completion_guard();
CREATE TRIGGER report_export_job_no_delete BEFORE DELETE ON report_export_jobs FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER report_export_artifact_no_delete BEFORE DELETE ON report_export_artifacts FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER report_export_events_immutable BEFORE UPDATE OR DELETE ON report_export_events FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE INDEX report_export_claim ON report_export_jobs(status,next_attempt_at,created_at);
CREATE INDEX report_export_creator ON report_export_jobs(tenant_id,created_by,created_at);
CREATE INDEX report_export_expiry ON report_export_artifacts(status,expires_at);
CREATE INDEX report_export_event_job ON report_export_events(tenant_id,job_id,created_at);

INSERT INTO permission_definitions(code,title,module) VALUES
('report:export:list','查看报表导出任务','报表导出'),('report:export:create','创建真实报表导出','报表导出'),('report:export:cancel','取消报表导出','报表导出'),
('report:export:retry','重试报表导出','报表导出'),('report:export:archive','归档报表导出','报表导出'),('report:export:download','下载报表导出制品','报表导出');

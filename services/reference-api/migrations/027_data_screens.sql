CREATE TABLE data_screen_definitions (
 tenant_id text NOT NULL REFERENCES tenants(id),id text NOT NULL,draft_schema jsonb NOT NULL CHECK(jsonb_typeof(draft_schema)='object' AND draft_schema->>'version'='1'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),draft_revision integer NOT NULL DEFAULT 1 CHECK(draft_revision>0),enabled boolean NOT NULL DEFAULT true,archived boolean NOT NULL DEFAULT false,active_release_id text,
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),CHECK(NOT archived OR NOT enabled)
);
CREATE TABLE data_screen_releases (
 tenant_id text NOT NULL,id text NOT NULL,definition_id text NOT NULL,version integer NOT NULL CHECK(version>0),draft_revision integer NOT NULL CHECK(draft_revision>0),
 schema_snapshot jsonb NOT NULL CHECK(jsonb_typeof(schema_snapshot)='object'),source_bindings jsonb NOT NULL CHECK(jsonb_typeof(source_bindings)='array' AND jsonb_array_length(source_bindings) BETWEEN 1 AND 10),
 content_canonical text NOT NULL,content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),published_by text NOT NULL,published_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,definition_id,id),UNIQUE(tenant_id,definition_id,version),
 FOREIGN KEY(tenant_id,definition_id) REFERENCES data_screen_definitions(tenant_id,id),FOREIGN KEY(tenant_id,published_by) REFERENCES memberships(tenant_id,user_id)
);
ALTER TABLE data_screen_definitions ADD FOREIGN KEY(tenant_id,id,active_release_id) REFERENCES data_screen_releases(tenant_id,definition_id,id);
CREATE TABLE data_screen_events (
 tenant_id text NOT NULL,id text NOT NULL,definition_id text NOT NULL,action text NOT NULL CHECK(action IN('created','copied','updated','published','rolled-back','toggled','archived')),
 actor_id text NOT NULL,actor_name text NOT NULL,detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(detail)='object'),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,definition_id) REFERENCES data_screen_definitions(tenant_id,id),FOREIGN KEY(tenant_id,actor_id) REFERENCES memberships(tenant_id,user_id)
);
CREATE FUNCTION af_data_screen_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.archived OR ROW(NEW.tenant_id,NEW.id,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Archived screen and screen identity are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER data_screen_identity_immutable BEFORE UPDATE ON data_screen_definitions FOR EACH ROW EXECUTE FUNCTION af_data_screen_identity_immutable();
CREATE TRIGGER data_screen_no_delete BEFORE DELETE ON data_screen_definitions FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER data_screen_release_immutable BEFORE UPDATE OR DELETE ON data_screen_releases FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER data_screen_event_immutable BEFORE UPDATE OR DELETE ON data_screen_events FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE FUNCTION af_data_screen_release_valid() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE d data_screen_definitions;b jsonb; rv report_definition_versions; ar application_releases;BEGIN
 IF NEW.content_canonical::jsonb IS DISTINCT FROM jsonb_build_object('snapshot',NEW.schema_snapshot,'sourceBindings',NEW.source_bindings)
 OR encode(sha256(convert_to(NEW.content_canonical,'UTF8')),'hex') IS DISTINCT FROM NEW.content_hash
 THEN RAISE EXCEPTION 'Screen release canonical content and digest must match the snapshot and bindings' USING ERRCODE='23514'; END IF;
 SELECT * INTO d FROM data_screen_definitions WHERE tenant_id=NEW.tenant_id AND id=NEW.definition_id;
 IF d.archived OR d.draft_schema IS DISTINCT FROM NEW.schema_snapshot OR d.draft_revision IS DISTINCT FROM NEW.draft_revision OR NEW.schema_snapshot->>'version' IS DISTINCT FROM '1'
 OR jsonb_array_length(NEW.schema_snapshot->'sources') IS DISTINCT FROM jsonb_array_length(NEW.source_bindings)
 OR (SELECT count(DISTINCT item->>'sourceKey') FROM jsonb_array_elements(NEW.source_bindings) item) <> jsonb_array_length(NEW.source_bindings)
 THEN RAISE EXCEPTION 'Screen release must fix the actual draft' USING ERRCODE='23514'; END IF;
 FOR b IN SELECT * FROM jsonb_array_elements(NEW.source_bindings) LOOP
  SELECT * INTO rv FROM report_definition_versions WHERE tenant_id=NEW.tenant_id AND id=b->>'reportDefinitionVersionId';
  SELECT * INTO ar FROM application_releases WHERE tenant_id=NEW.tenant_id AND id=rv.source_release_id;
  IF rv.id IS NULL OR ar.id IS NULL OR rv.definition_id IS DISTINCT FROM b->>'reportDefinitionId' OR rv.version::text IS DISTINCT FROM b->>'reportDefinitionVersion'
   OR rv.content_hash IS DISTINCT FROM b->>'reportContentHash' OR ar.content_hash IS DISTINCT FROM b->>'sourceContentHash'
   OR rv.source_release_id IS DISTINCT FROM b->>'sourceReleaseId' OR rv.source_release_version::text IS DISTINCT FROM b->>'sourceReleaseVersion'
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.schema_snapshot->'sources') s WHERE s->>'sourceKey'=b->>'sourceKey' AND s->>'reportDefinitionVersionId'=rv.id)
  THEN RAISE EXCEPTION 'Screen binding must fix a same-tenant immutable report and source release' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER data_screen_release_valid BEFORE INSERT ON data_screen_releases FOR EACH ROW EXECUTE FUNCTION af_data_screen_release_valid();
CREATE INDEX data_screen_definition_listing ON data_screen_definitions(tenant_id,updated_at DESC,id);
CREATE INDEX data_screen_event_history ON data_screen_events(tenant_id,definition_id,created_at,id);
INSERT INTO permission_definitions(code,title,module) VALUES
('screen:list','查看大屏配置','真实大屏'),('screen:create','创建独立大屏','真实大屏'),('screen:update','编辑大屏草稿','真实大屏'),('screen:publish','发布大屏快照','真实大屏'),
('screen:rollback','切换大屏历史发布版','真实大屏'),('screen:toggle','启停大屏','真实大屏'),('screen:archive','归档大屏','真实大屏'),('screen:run','运行授权大屏','真实大屏');
INSERT INTO menu_route_catalogue(key,path,component_key,parent_key,locale,permissions,permission_mode,menu_type,default_order,protected) VALUES
('dataScreen','/visualization/dataScreen','DataScreenPage','visualization','menu.visualization.dataScreen','["screen:list","screen:run"]'::jsonb,'any','menu',2,false);
INSERT INTO menu_resources(tenant_id,id,menu_name,menu_type,route_key,parent_id,sort)
 SELECT t.id,'default-'||r.key,r.locale,r.menu_type,r.key,'default-'||r.parent_key,r.default_order
 FROM tenants t CROSS JOIN menu_route_catalogue r WHERE r.key='dataScreen';

CREATE TABLE audit_export_jobs (
 tenant_id text NOT NULL REFERENCES tenants(id),id text NOT NULL,created_by text NOT NULL,created_name text NOT NULL,format text NOT NULL CHECK(format IN('csv','xlsx','pdf')),
 query jsonb NOT NULL CHECK(jsonb_typeof(query)='object'),snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),snapshot_canonical text NOT NULL CHECK(octet_length(snapshot_canonical)<=2097152),snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 event_ids text[] NOT NULL,object_key text NOT NULL UNIQUE CHECK(object_key ~ '^[a-f0-9]{64}$'),total_rows integer NOT NULL CHECK(total_rows BETWEEN 0 AND 2000),processed_rows integer NOT NULL DEFAULT 0 CHECK(processed_rows BETWEEN 0 AND total_rows),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','completed','failed','blocked','cancelled','infected','expired')),
 stage text NOT NULL DEFAULT 'queued' CHECK(stage IN('queued','rendering','scanning','completed','stopped')),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 claimed_by text,lease_until timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),error_code text,error_message text,artifact_id text,
 archived_at timestamptz,retention_until timestamptz NOT NULL DEFAULT(now()+interval '7 days'),expired_at timestamptz,bytes_purged_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,id,object_key),FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),
 CHECK(cardinality(event_ids)=total_rows AND jsonb_array_length(snapshot->'rows')=total_rows),
 CHECK((status='processing')=(claimed_by IS NOT NULL AND lease_until IS NOT NULL)),
 CHECK((status='queued' AND stage='queued') OR (status='processing' AND stage IN('rendering','scanning')) OR (status='completed' AND stage='completed') OR (status IN('failed','blocked','cancelled','infected','expired') AND stage='stopped')),
 CHECK((status='expired')=(expired_at IS NOT NULL)),CHECK(bytes_purged_at IS NULL OR status='expired'),CHECK(status NOT IN('completed','infected') OR artifact_id IS NOT NULL)
);
CREATE TABLE audit_export_artifacts (
 tenant_id text NOT NULL,id text NOT NULL,job_id text NOT NULL,object_key text NOT NULL,file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 120 AND file_name !~ '[[:cntrl:]/\\]'),mime_type text NOT NULL,
 size integer NOT NULL CHECK(size BETWEEN 1 AND 10485760),sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),status text NOT NULL CHECK(status IN('ready','quarantined','expired')),
 scan_engine text NOT NULL CHECK(scan_engine LIKE 'ClamAV %'),scanned_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,expired_at timestamptz,purged_at timestamptz,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id),UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,object_key) REFERENCES audit_export_jobs(tenant_id,id,object_key),
 CHECK((status='expired')=(expired_at IS NOT NULL)),CHECK(purged_at IS NULL OR status='expired')
);
ALTER TABLE audit_export_jobs ADD FOREIGN KEY(tenant_id,id,artifact_id) REFERENCES audit_export_artifacts(tenant_id,job_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE audit_export_events (
 tenant_id text NOT NULL,id text NOT NULL,job_id text NOT NULL,action text NOT NULL,actor_id text,actor_name text NOT NULL,trace_id text NOT NULL,detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(detail)='object'),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,job_id) REFERENCES audit_export_jobs(tenant_id,id),FOREIGN KEY(tenant_id,actor_id) REFERENCES memberships(tenant_id,user_id)
);
CREATE FUNCTION af_audit_export_plan_valid() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.retention_until IS DISTINCT FROM (NEW.created_at + (CASE WHEN NEW.archived_at IS NULL THEN interval '7 days' ELSE interval '365 days' END)) THEN RAISE EXCEPTION 'Audit artifact retention is fixed from creation' USING ERRCODE='23514'; END IF;
 IF NEW.snapshot_canonical::jsonb IS DISTINCT FROM NEW.snapshot OR encode(sha256(convert_to(NEW.snapshot_canonical,'UTF8')),'hex') IS DISTINCT FROM NEW.snapshot_hash
 OR NEW.snapshot->>'version' IS DISTINCT FROM '1' OR NEW.snapshot->>'producerVersion' IS DISTINCT FROM '1' OR NEW.snapshot->>'projectionVersion' IS DISTINCT FROM '1' OR NEW.snapshot->>'source' IS DISTINCT FROM 'server'
 OR jsonb_typeof(NEW.snapshot->'rows') IS DISTINCT FROM 'array'
 OR NEW.snapshot->'query' IS DISTINCT FROM NEW.query OR NEW.snapshot->>'total' IS DISTINCT FROM NEW.total_rows::text
 OR (SELECT count(DISTINCT id) FROM unnest(NEW.event_ids) id)<>NEW.total_rows
 OR to_jsonb(NEW.event_ids) IS DISTINCT FROM (SELECT COALESCE(jsonb_agg(value->>'id' ORDER BY ordinal),'[]'::jsonb) FROM jsonb_array_elements(NEW.snapshot->'rows') WITH ORDINALITY r(value,ordinal))
 OR EXISTS(SELECT 1 FROM unnest(NEW.event_ids) selected WHERE NOT EXISTS(SELECT 1 FROM audit_events e WHERE e.tenant_id=NEW.tenant_id AND e.id=selected))
 THEN RAISE EXCEPTION 'Audit export requires an exact same-tenant immutable fact snapshot and digest' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_export_plan_valid BEFORE INSERT ON audit_export_jobs FOR EACH ROW EXECUTE FUNCTION af_audit_export_plan_valid();
CREATE FUNCTION af_audit_export_job_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.created_by,NEW.created_name,NEW.created_at,NEW.format,NEW.query,NEW.snapshot,NEW.snapshot_canonical,NEW.snapshot_hash,NEW.event_ids,NEW.object_key,NEW.total_rows)
 IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.created_by,OLD.created_name,OLD.created_at,OLD.format,OLD.query,OLD.snapshot,OLD.snapshot_canonical,OLD.snapshot_hash,OLD.event_ids,OLD.object_key,OLD.total_rows)
 THEN RAISE EXCEPTION 'Audit export capture identity is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.expired_at IS NOT NULL AND ROW(NEW.status,NEW.expired_at,NEW.retention_until,NEW.archived_at) IS DISTINCT FROM ROW(OLD.status,OLD.expired_at,OLD.retention_until,OLD.archived_at) THEN RAISE EXCEPTION 'Expired audit exports cannot revive' USING ERRCODE='23514'; END IF;
 IF NEW.retention_until IS DISTINCT FROM (NEW.created_at + (CASE WHEN NEW.archived_at IS NULL THEN interval '7 days' ELSE interval '365 days' END)) THEN RAISE EXCEPTION 'Audit artifact retention is fixed from creation' USING ERRCODE='23514'; END IF;
 IF OLD.status IN('completed','cancelled','infected') AND NEW.status NOT IN(OLD.status,'expired') THEN RAISE EXCEPTION 'Terminal audit export cannot restart' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_export_job_guard BEFORE UPDATE ON audit_export_jobs FOR EACH ROW EXECUTE FUNCTION af_audit_export_job_guard();
CREATE FUNCTION af_audit_export_artifact_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.job_id,NEW.object_key,NEW.file_name,NEW.mime_type,NEW.size,NEW.sha256,NEW.scan_engine,NEW.scanned_at,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.job_id,OLD.object_key,OLD.file_name,OLD.mime_type,OLD.size,OLD.sha256,OLD.scan_engine,OLD.scanned_at,OLD.created_at) THEN RAISE EXCEPTION 'Audit export artifact bytes are immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status<>NEW.status AND NEW.status<>'expired' THEN RAISE EXCEPTION 'Expired audit artifact cannot revive' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_export_artifact_guard BEFORE UPDATE ON audit_export_artifacts FOR EACH ROW EXECUTE FUNCTION af_audit_export_artifact_guard();
CREATE TRIGGER audit_export_job_no_delete BEFORE DELETE ON audit_export_jobs FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER audit_export_artifact_no_delete BEFORE DELETE ON audit_export_artifacts FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER audit_export_event_immutable BEFORE UPDATE OR DELETE ON audit_export_events FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE INDEX audit_export_claim ON audit_export_jobs(status,next_attempt_at,lease_until,created_at);
CREATE INDEX audit_export_owner ON audit_export_jobs(tenant_id,created_by,created_at DESC,id);
INSERT INTO permission_definitions(code,title,module) VALUES
('audit:export:list','查看审计导出','审计治理'),('audit:export:create','创建审计导出','审计治理'),('audit:export:cancel','取消审计导出','审计治理'),('audit:export:retry','重试审计导出','审计治理'),('audit:export:archive','归档审计导出','审计治理'),('audit:export:download','下载审计导出','审计治理'),('audit:retention:manage','管理审计保留策略','审计治理');

-- Logical membership only: original audit_events remain immutable and are never purged.
CREATE UNIQUE INDEX audit_event_tenant_identity ON audit_events(tenant_id,id);
CREATE TABLE audit_retention_policies (
 tenant_id text PRIMARY KEY REFERENCES tenants(id),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),enabled boolean NOT NULL DEFAULT false,
 hot_days integer NOT NULL DEFAULT 90 CHECK(hot_days BETWEEN 1 AND 3650),time_zone text NOT NULL DEFAULT 'Asia/Shanghai',executor_id text,
 updated_at timestamptz,last_run_id text,next_run_at timestamptz,
 FOREIGN KEY(tenant_id,executor_id) REFERENCES memberships(tenant_id,user_id),CHECK(NOT enabled OR executor_id IS NOT NULL)
);
CREATE TABLE audit_archive_runs (
 tenant_id text NOT NULL REFERENCES tenants(id),id text NOT NULL,executor_id text NOT NULL,trigger text NOT NULL CHECK(trigger IN('manual','policy')),
 policy_revision integer,occurrence_date date,occurrence_zone text,occurrence_boundary timestamptz,
 query jsonb NOT NULL,format text NOT NULL CHECK(format IN('csv','xlsx','pdf')),queried_at timestamptz NOT NULL,data_cutoff_at timestamptz NOT NULL,
 manifest_canonical text NOT NULL,manifest_hash text NOT NULL CHECK(manifest_hash ~ '^[a-f0-9]{64}$'),candidate_total integer NOT NULL CHECK(candidate_total BETWEEN 0 AND 100000),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','completed','failed','blocked','cancelled')),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),next_attempt_at timestamptz NOT NULL DEFAULT now(),claimed_by text,lease_until timestamptz,
 error_code text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,executor_id) REFERENCES memberships(tenant_id,user_id),
 UNIQUE(tenant_id,occurrence_date),CHECK((trigger='policy')=(policy_revision IS NOT NULL AND occurrence_date IS NOT NULL AND occurrence_zone IS NOT NULL AND occurrence_boundary IS NOT NULL)),
 CHECK((claimed_by IS NULL)=(lease_until IS NULL)),CHECK(status='processing' OR claimed_by IS NULL),
 CHECK(manifest_canonical::jsonb->>'version'='1' AND manifest_canonical::jsonb->>'source'='server' AND manifest_canonical::jsonb->>'projectionVersion'='1'),
 CHECK(manifest_canonical::jsonb->>'runId'=id AND manifest_canonical::jsonb->'query'=query AND (manifest_canonical::jsonb->>'total')::integer=candidate_total),
 CHECK(jsonb_array_length(manifest_canonical::jsonb->'candidates')=candidate_total),CHECK(encode(sha256(convert_to(manifest_canonical,'UTF8')),'hex')=manifest_hash)
);
ALTER TABLE audit_retention_policies ADD FOREIGN KEY(tenant_id,last_run_id) REFERENCES audit_archive_runs(tenant_id,id);
CREATE TABLE audit_archive_candidates (
 tenant_id text NOT NULL,run_id text NOT NULL,event_id text NOT NULL,ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 100000),occurred_at timestamptz NOT NULL,
 required_visible_fields text[] NOT NULL CHECK(required_visible_fields <@ ARRAY['operator.id','operator.name','operator.role']::text[]),target_id_visible boolean NOT NULL,
 PRIMARY KEY(tenant_id,run_id,ordinal),UNIQUE(tenant_id,run_id,event_id),
 FOREIGN KEY(tenant_id,run_id) REFERENCES audit_archive_runs(tenant_id,id),FOREIGN KEY(tenant_id,event_id) REFERENCES audit_events(tenant_id,id)
);
CREATE TABLE audit_archive_batches (
 tenant_id text NOT NULL,id text NOT NULL,run_id text NOT NULL,ordinal integer NOT NULL CHECK(ordinal>0),first_ordinal integer NOT NULL,last_ordinal integer NOT NULL,
 snapshot jsonb,snapshot_canonical text,snapshot_hash text,object_key text NOT NULL UNIQUE CHECK(object_key ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','completed','failed','blocked','cancelled','infected')),
 revision integer NOT NULL DEFAULT 1,attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),next_attempt_at timestamptz NOT NULL DEFAULT now(),claimed_by text,lease_until timestamptz,error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,retention_until timestamptz NOT NULL DEFAULT(now()+interval '365 days'),bytes_purged_at timestamptz,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,run_id,ordinal),UNIQUE(tenant_id,run_id,id),UNIQUE(tenant_id,id,object_key),
 FOREIGN KEY(tenant_id,run_id) REFERENCES audit_archive_runs(tenant_id,id),
 CHECK(retention_until=created_at+interval '365 days'),CHECK(bytes_purged_at IS NULL OR status IN('completed','failed','blocked','cancelled','infected')),
 CHECK(first_ordinal>0 AND last_ordinal>=first_ordinal AND last_ordinal-first_ordinal<2000 AND last_ordinal<=100000),
 CHECK((status='processing')=(claimed_by IS NOT NULL AND lease_until IS NOT NULL)),
 CHECK((snapshot IS NULL AND snapshot_canonical IS NULL AND snapshot_hash IS NULL) OR
 (snapshot IS NOT NULL AND snapshot_canonical IS NOT NULL AND snapshot_hash IS NOT NULL AND octet_length(snapshot_canonical)<=2097152 AND snapshot_canonical::jsonb=snapshot AND encode(sha256(convert_to(snapshot_canonical,'UTF8')),'hex')=snapshot_hash
 AND snapshot->>'kind'='archive-batch' AND snapshot->>'version'='1' AND snapshot->>'producerVersion'='2' AND snapshot->>'projectionVersion'='1' AND snapshot->>'source'='server' AND snapshot->>'runId'=run_id
 AND (snapshot->>'ordinal')::integer=ordinal AND (snapshot->'candidateRange'->>'firstOrdinal')::integer=first_ordinal AND (snapshot->'candidateRange'->>'lastOrdinal')::integer=last_ordinal
 AND jsonb_array_length(snapshot->'snapshot'->'rows')=last_ordinal-first_ordinal+1))
);
CREATE TABLE audit_archive_artifacts (
 tenant_id text NOT NULL,id text NOT NULL,batch_id text NOT NULL,object_key text NOT NULL,file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 120 AND file_name !~ '[[:cntrl:]/\\]'),mime_type text NOT NULL,
 size integer NOT NULL CHECK(size BETWEEN 1 AND 10485760),sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),status text NOT NULL CHECK(status IN('ready','quarantined','expired')),
 scan_engine text NOT NULL CHECK(scan_engine LIKE 'ClamAV %'),scanned_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT(now()+interval '365 days'),expired_at timestamptz,purged_at timestamptz,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,batch_id),UNIQUE(tenant_id,batch_id,id),FOREIGN KEY(tenant_id,batch_id,object_key) REFERENCES audit_archive_batches(tenant_id,id,object_key),
 CHECK(expires_at=created_at+interval '365 days'),CHECK((status='expired')=(expired_at IS NOT NULL)),CHECK(purged_at IS NULL OR status='expired')
);
CREATE TABLE audit_archive_memberships (
 tenant_id text NOT NULL,event_id text NOT NULL,run_id text NOT NULL,batch_id text NOT NULL,artifact_id text NOT NULL,snapshot_hash text NOT NULL,archived_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,event_id),FOREIGN KEY(tenant_id,event_id) REFERENCES audit_events(tenant_id,id),FOREIGN KEY(tenant_id,run_id,batch_id) REFERENCES audit_archive_batches(tenant_id,run_id,id),
 FOREIGN KEY(tenant_id,batch_id,artifact_id) REFERENCES audit_archive_artifacts(tenant_id,batch_id,id)
);
CREATE TABLE audit_archive_events (
 tenant_id text NOT NULL,id text NOT NULL,run_id text NOT NULL,batch_id text,action text NOT NULL,actor_id text,trace_id text NOT NULL,detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,run_id) REFERENCES audit_archive_runs(tenant_id,id),FOREIGN KEY(tenant_id,run_id,batch_id) REFERENCES audit_archive_batches(tenant_id,run_id,id),FOREIGN KEY(tenant_id,actor_id) REFERENCES memberships(tenant_id,user_id)
);
CREATE FUNCTION af_audit_archive_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.executor_id,NEW.trigger,NEW.policy_revision,NEW.occurrence_date,NEW.occurrence_zone,NEW.occurrence_boundary,NEW.query,NEW.format,NEW.queried_at,NEW.data_cutoff_at,NEW.manifest_canonical,NEW.manifest_hash,NEW.candidate_total,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.executor_id,OLD.trigger,OLD.policy_revision,OLD.occurrence_date,OLD.occurrence_zone,OLD.occurrence_boundary,OLD.query,OLD.format,OLD.queried_at,OLD.data_cutoff_at,OLD.manifest_canonical,OLD.manifest_hash,OLD.candidate_total,OLD.created_at) THEN RAISE EXCEPTION 'Archive candidate capture is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status IN('completed','cancelled') AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'Terminal archive run cannot restart' USING ERRCODE='23514'; END IF;
 IF NEW.status='completed' AND EXISTS(SELECT 1 FROM audit_archive_candidates c WHERE c.tenant_id=NEW.tenant_id AND c.run_id=NEW.id AND NOT EXISTS(SELECT 1 FROM audit_archive_memberships m WHERE m.tenant_id=c.tenant_id AND m.event_id=c.event_id)) THEN RAISE EXCEPTION 'Archive coverage incomplete' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_archive_run_guard BEFORE UPDATE ON audit_archive_runs FOR EACH ROW EXECUTE FUNCTION af_audit_archive_run_guard();
CREATE FUNCTION af_audit_archive_manifest_complete(p_tenant text,p_run text) RETURNS boolean LANGUAGE sql AS $$
 WITH expected AS (
  SELECT e.* FROM audit_archive_runs r CROSS JOIN LATERAL jsonb_to_recordset(r.manifest_canonical::jsonb->'candidates') AS e("eventId" text,ordinal integer,"occurredAt" timestamptz,"requiredVisibleFields" text[],"targetIdVisible" boolean) WHERE r.tenant_id=p_tenant AND r.id=p_run
 ), actual AS (SELECT * FROM audit_archive_candidates WHERE tenant_id=p_tenant AND run_id=p_run)
 SELECT NOT EXISTS(SELECT 1 FROM expected FULL JOIN actual USING(ordinal) WHERE actual.event_id IS NULL OR expected."eventId" IS NULL OR ROW(actual.event_id,actual.occurred_at,actual.required_visible_fields,actual.target_id_visible) IS DISTINCT FROM ROW(expected."eventId",expected."occurredAt",expected."requiredVisibleFields",expected."targetIdVisible"))
 AND (SELECT candidate_total FROM audit_archive_runs WHERE tenant_id=p_tenant AND id=p_run)=(SELECT count(*) FROM actual)

$$;
CREATE FUNCTION af_audit_archive_candidate_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE scope record; BEGIN
 FOR scope IN SELECT DISTINCT tenant_id,run_id FROM inserted LOOP
  IF NOT af_audit_archive_manifest_complete(scope.tenant_id,scope.run_id) THEN RAISE EXCEPTION 'Candidates must exactly match complete fixed manifest' USING ERRCODE='23514'; END IF;
 END LOOP; RETURN NULL;
END $$;
CREATE TRIGGER audit_archive_candidate_guard AFTER INSERT ON audit_archive_candidates REFERENCING NEW TABLE AS inserted FOR EACH STATEMENT EXECUTE FUNCTION af_audit_archive_candidate_guard();
CREATE FUNCTION af_audit_archive_run_complete_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT af_audit_archive_manifest_complete(NEW.tenant_id,NEW.id) THEN RAISE EXCEPTION 'Complete candidate manifest must persist atomically' USING ERRCODE='23514'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER audit_archive_run_complete_guard AFTER INSERT ON audit_archive_runs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION af_audit_archive_run_complete_guard();
CREATE FUNCTION af_audit_archive_batch_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.retention_until IS DISTINCT FROM OLD.retention_until OR (OLD.bytes_purged_at IS NOT NULL AND NEW.bytes_purged_at IS DISTINCT FROM OLD.bytes_purged_at) THEN RAISE EXCEPTION 'Archive reservation lifetime cannot change or revive' USING ERRCODE='23514'; END IF;
 IF NEW.bytes_purged_at IS NOT NULL AND OLD.bytes_purged_at IS NULL AND (
  EXISTS(SELECT 1 FROM audit_archive_artifacts a WHERE a.tenant_id=NEW.tenant_id AND a.batch_id=NEW.id AND a.purged_at IS NULL)
  OR (NEW.retention_until>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM audit_archive_artifacts a WHERE a.tenant_id=NEW.tenant_id AND a.batch_id=NEW.id AND a.purged_at IS NOT NULL))) THEN RAISE EXCEPTION 'Archive reservation retirement requires expired bytes' USING ERRCODE='23514'; END IF;
 IF NEW.status IN('queued','processing') AND (NEW.bytes_purged_at IS NOT NULL OR NEW.retention_until<=clock_timestamp()) THEN RAISE EXCEPTION 'Expired archive batch cannot restart' USING ERRCODE='23514'; END IF;
 IF ROW(NEW.tenant_id,NEW.id,NEW.run_id,NEW.ordinal,NEW.first_ordinal,NEW.object_key,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.run_id,OLD.ordinal,OLD.first_ordinal,OLD.object_key,OLD.created_at) OR (OLD.snapshot IS NOT NULL AND ROW(NEW.snapshot,NEW.snapshot_canonical,NEW.snapshot_hash,NEW.last_ordinal) IS DISTINCT FROM ROW(OLD.snapshot,OLD.snapshot_canonical,OLD.snapshot_hash,OLD.last_ordinal)) THEN RAISE EXCEPTION 'Archive batch provenance is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status IN('completed','cancelled','infected') AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'Terminal archive batch cannot restart' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_archive_batch_guard BEFORE UPDATE ON audit_archive_batches FOR EACH ROW EXECUTE FUNCTION af_audit_archive_batch_guard();
CREATE FUNCTION af_audit_archive_membership_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM audit_archive_batches b JOIN audit_archive_artifacts a ON a.tenant_id=b.tenant_id AND a.batch_id=b.id JOIN audit_archive_candidates c ON c.tenant_id=b.tenant_id AND c.run_id=b.run_id AND c.ordinal BETWEEN b.first_ordinal AND b.last_ordinal WHERE b.tenant_id=NEW.tenant_id AND b.id=NEW.batch_id AND b.run_id=NEW.run_id AND b.status='completed' AND b.snapshot_hash=NEW.snapshot_hash AND a.id=NEW.artifact_id AND a.status='ready' AND a.expires_at>clock_timestamp() AND c.event_id=NEW.event_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(b.snapshot->'snapshot'->'rows') r WHERE r->>'id'=NEW.event_id)) THEN RAISE EXCEPTION 'Logical membership requires clean completed batch artifact' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_archive_membership_guard BEFORE INSERT ON audit_archive_memberships FOR EACH ROW EXECUTE FUNCTION af_audit_archive_membership_guard();
CREATE FUNCTION af_audit_archive_artifact_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.batch_id,NEW.object_key,NEW.file_name,NEW.mime_type,NEW.size,NEW.sha256,NEW.scan_engine,NEW.scanned_at,NEW.created_at,NEW.expires_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.batch_id,OLD.object_key,OLD.file_name,OLD.mime_type,OLD.size,OLD.sha256,OLD.scan_engine,OLD.scanned_at,OLD.created_at,OLD.expires_at) OR (OLD.status<>NEW.status AND NEW.status<>'expired') THEN RAISE EXCEPTION 'Archive artifact cannot change or revive' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER audit_archive_artifact_guard BEFORE UPDATE ON audit_archive_artifacts FOR EACH ROW EXECUTE FUNCTION af_audit_archive_artifact_guard();
CREATE TRIGGER audit_archive_membership_immutable BEFORE UPDATE OR DELETE ON audit_archive_memberships FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER audit_archive_candidate_immutable BEFORE UPDATE OR DELETE ON audit_archive_candidates FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER audit_archive_event_immutable BEFORE UPDATE OR DELETE ON audit_archive_events FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER audit_archive_run_no_delete BEFORE DELETE ON audit_archive_runs FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER audit_archive_batch_no_delete BEFORE DELETE ON audit_archive_batches FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER audit_archive_artifact_no_delete BEFORE DELETE ON audit_archive_artifacts FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE INDEX audit_archive_claim ON audit_archive_runs(status,next_attempt_at,lease_until,created_at);
CREATE INDEX audit_archive_batch_claim ON audit_archive_batches(tenant_id,run_id,status,first_ordinal);
CREATE INDEX audit_archive_artifact_expiry ON audit_archive_artifacts(expires_at) WHERE purged_at IS NULL;

ALTER TABLE audit_archive_runs ADD CHECK((jsonb_typeof(manifest_canonical::jsonb)='object' AND manifest_canonical::jsonb->>'version'='1' AND manifest_canonical::jsonb->>'projectionVersion'='1' AND manifest_canonical::jsonb->>'source'='server' AND manifest_canonical::jsonb->>'runId'=id AND manifest_canonical::jsonb->'query'=query AND (manifest_canonical::jsonb->>'total')::int=candidate_total AND jsonb_typeof(manifest_canonical::jsonb->'candidates')='array' AND jsonb_array_length(manifest_canonical::jsonb->'candidates')=candidate_total AND (manifest_canonical::jsonb-'version'-'projectionVersion'-'source'-'runId'-'query'-'queriedAt'-'dataCutoffAt'-'total'-'candidates')='{}'::jsonb) IS TRUE);
CREATE FUNCTION af_audit_archive_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE expected_ids jsonb; capture audit_archive_runs; BEGIN
 IF NEW.snapshot IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO capture FROM audit_archive_runs WHERE tenant_id=NEW.tenant_id AND id=NEW.run_id;
 SELECT jsonb_agg(event_id ORDER BY ordinal) INTO expected_ids FROM audit_archive_candidates WHERE tenant_id=NEW.tenant_id AND run_id=NEW.run_id AND ordinal BETWEEN NEW.first_ordinal AND NEW.last_ordinal;
 IF NEW.snapshot->>'kind' IS DISTINCT FROM 'archive-batch' OR NEW.snapshot->>'version' IS DISTINCT FROM '1' OR NEW.snapshot->>'producerVersion' IS DISTINCT FROM '2' OR NEW.snapshot->>'projectionVersion' IS DISTINCT FROM '1' OR NEW.snapshot->>'source' IS DISTINCT FROM 'server'
 OR NEW.snapshot->>'runId' IS DISTINCT FROM NEW.run_id OR (NEW.snapshot->>'candidateTotal')::int IS DISTINCT FROM capture.candidate_total OR NEW.snapshot->'snapshot'->'query' IS DISTINCT FROM capture.query
 OR (NEW.snapshot->'snapshot'->>'queriedAt')::timestamptz IS DISTINCT FROM capture.queried_at OR (NEW.snapshot->'snapshot'->>'dataCutoffAt')::timestamptz IS DISTINCT FROM capture.data_cutoff_at
 OR NEW.snapshot->'snapshot'->>'version' IS DISTINCT FROM '1' OR NEW.snapshot->'snapshot'->>'producerVersion' IS DISTINCT FROM '1' OR NEW.snapshot->'snapshot'->>'projectionVersion' IS DISTINCT FROM '1' OR NEW.snapshot->'snapshot'->>'source' IS DISTINCT FROM 'server'
 OR (NEW.snapshot->'snapshot'->>'total')::int IS DISTINCT FROM NEW.last_ordinal-NEW.first_ordinal+1
 OR expected_ids IS DISTINCT FROM (SELECT jsonb_agg(r->>'id' ORDER BY ordinal) FROM jsonb_array_elements(NEW.snapshot->'snapshot'->'rows') WITH ORDINALITY x(r,ordinal))
 THEN RAISE EXCEPTION 'Archive snapshot must represent exactly its fixed candidate range' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_archive_snapshot_guard BEFORE INSERT OR UPDATE ON audit_archive_batches FOR EACH ROW EXECUTE FUNCTION af_audit_archive_snapshot_guard();
ALTER TABLE audit_archive_events ADD CHECK(jsonb_typeof(detail)='object' AND (detail-'code'-'attempt'-'ordinal')='{}'::jsonb AND octet_length(detail::text)<=512);

CREATE FUNCTION af_audit_archive_artifact_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM audit_archive_batches b WHERE b.tenant_id=NEW.tenant_id AND b.id=NEW.batch_id AND b.object_key=NEW.object_key AND b.status='processing' AND b.bytes_purged_at IS NULL AND b.retention_until>clock_timestamp() AND b.lease_until>clock_timestamp()) THEN RAISE EXCEPTION 'Archive artifact requires a live fenced reservation' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER audit_archive_artifact_insert_guard BEFORE INSERT ON audit_archive_artifacts FOR EACH ROW EXECUTE FUNCTION af_audit_archive_artifact_insert_guard();
CREATE INDEX audit_archive_reservation_expiry ON audit_archive_batches(retention_until) WHERE bytes_purged_at IS NULL;

-- Add the logical archival page, preserving each tenant's existing parent and tombstones.
INSERT INTO menu_route_catalogue(key,path,component_key,parent_key,locale,permissions,permission_mode,menu_type,default_order,protected) VALUES
('auditRetention','/audit/retention','AuditRetention','audit','menu.audit.retention',
 '["audit:retention:manage","audit:read","audit:export:create","audit:export:archive"]'::jsonb,
 'all','menu',2,false);
INSERT INTO menu_resources(tenant_id,id,menu_name,menu_type,route_key,parent_id,sort)
 SELECT t.id,'default-'||r.key,r.locale,r.menu_type,r.key,parent.id,r.default_order
 FROM tenants t CROSS JOIN menu_route_catalogue r
 LEFT JOIN LATERAL (
   SELECT m.id FROM menu_resources m
   WHERE m.tenant_id=t.id AND m.route_key='audit'
   ORDER BY (m.deleted_at IS NULL) DESC,m.created_at,m.id LIMIT 1
 ) parent ON true
 WHERE r.key='auditRetention'
 AND NOT EXISTS(SELECT 1 FROM menu_resources m WHERE m.tenant_id=t.id AND m.route_key=r.key)
 ON CONFLICT DO NOTHING;

CREATE FUNCTION af_audit_archive_reservation_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.bytes_purged_at IS NOT NULL OR NEW.status<>'queued' OR NEW.attempts<>0 OR NEW.claimed_by IS NOT NULL OR NEW.lease_until IS NOT NULL OR NEW.snapshot IS NOT NULL THEN RAISE EXCEPTION 'New archive reservation must start unclaimed and unpublished' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_archive_reservation_insert_guard BEFORE INSERT ON audit_archive_batches FOR EACH ROW EXECUTE FUNCTION af_audit_archive_reservation_insert_guard();

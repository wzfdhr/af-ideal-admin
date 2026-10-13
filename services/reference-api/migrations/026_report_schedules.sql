CREATE TABLE report_schedules (
 tenant_id text NOT NULL REFERENCES tenants(id),id text NOT NULL,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),enabled boolean NOT NULL,
 active_version_id text NOT NULL,active_period_id text,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),CHECK(enabled=(active_period_id IS NOT NULL))
);
CREATE TABLE report_schedule_versions (
 tenant_id text NOT NULL,id text NOT NULL,schedule_id text NOT NULL,version integer NOT NULL CHECK(version>0),schema_snapshot jsonb NOT NULL CHECK(jsonb_typeof(schema_snapshot)='object'),
 definition_version_id text NOT NULL,content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,schedule_id,id),UNIQUE(tenant_id,schedule_id,version),
 FOREIGN KEY(tenant_id,schedule_id) REFERENCES report_schedules(tenant_id,id),FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),
 FOREIGN KEY(tenant_id,definition_version_id) REFERENCES report_definition_versions(tenant_id,id)
);
CREATE TABLE report_schedule_periods (
 tenant_id text NOT NULL,id text NOT NULL,schedule_id text NOT NULL,rule_version_id text NOT NULL,origin_id text NOT NULL,
 started_at timestamptz NOT NULL,closed_at timestamptz,cursor_at timestamptz,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),exhausted_at timestamptz,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,schedule_id,id),UNIQUE(tenant_id,id,rule_version_id),
 FOREIGN KEY(tenant_id,schedule_id,rule_version_id) REFERENCES report_schedule_versions(tenant_id,schedule_id,id),FOREIGN KEY(tenant_id,origin_id) REFERENCES memberships(tenant_id,user_id),
 CHECK(closed_at IS NULL OR closed_at>=started_at),CHECK(cursor_at IS NULL OR cursor_at>started_at)
);
ALTER TABLE report_schedules ADD FOREIGN KEY(tenant_id,id,active_version_id) REFERENCES report_schedule_versions(tenant_id,schedule_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE report_schedules ADD FOREIGN KEY(tenant_id,id,active_period_id) REFERENCES report_schedule_periods(tenant_id,schedule_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE report_schedule_runs (
 tenant_id text NOT NULL,id text NOT NULL,schedule_id text NOT NULL,period_id text NOT NULL,rule_version_id text NOT NULL,slot_at timestamptz NOT NULL,
 query jsonb,status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','waiting-exports','completed','partial-failed','failed','blocked','cancelled')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_by text NOT NULL,recipients_resolved_at timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),next_attempt_at timestamptz NOT NULL DEFAULT now(),claimed_by text,lease_until timestamptz,error_code text,error_message text,
 alert_outbox_id text NOT NULL,alert_notified_at timestamptz,cancelled_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,period_id,slot_at),UNIQUE(tenant_id,schedule_id,id),
 FOREIGN KEY(tenant_id,schedule_id) REFERENCES report_schedules(tenant_id,id),FOREIGN KEY(tenant_id,period_id,rule_version_id) REFERENCES report_schedule_periods(tenant_id,id,rule_version_id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),CHECK((status='processing')=(claimed_by IS NOT NULL AND lease_until IS NOT NULL)),CHECK(query IS NULL OR jsonb_typeof(query)='object')
);
CREATE TABLE report_schedule_run_recipients (
 tenant_id text NOT NULL,id text NOT NULL,run_id text NOT NULL,user_id text NOT NULL,status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','waiting-export','completed','failed','blocked','skipped','cancelled')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),next_attempt_at timestamptz NOT NULL DEFAULT now(),claimed_by text,lease_until timestamptz,error_code text,error_message text,
 export_job_id text,notification_outbox_id text NOT NULL,notification_id text,notified_at timestamptz,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,run_id,user_id),UNIQUE(tenant_id,run_id,id,user_id),UNIQUE(tenant_id,export_job_id),
 FOREIGN KEY(tenant_id,run_id) REFERENCES report_schedule_runs(tenant_id,id),FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id),FOREIGN KEY(tenant_id,export_job_id) REFERENCES report_export_jobs(tenant_id,id),
 FOREIGN KEY(tenant_id,notification_id) REFERENCES notifications(tenant_id,id),CHECK((status='processing')=(claimed_by IS NOT NULL AND lease_until IS NOT NULL)),CHECK((status='completed')=(notified_at IS NOT NULL)),CHECK(status<>'completed' OR (export_job_id IS NOT NULL AND notification_id IS NOT NULL))
);
CREATE TABLE report_export_recipient_grants (
 tenant_id text NOT NULL,job_id text NOT NULL,run_id text NOT NULL,recipient_fact_id text NOT NULL,recipient_user_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,job_id),UNIQUE(tenant_id,run_id,recipient_fact_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES report_export_jobs(tenant_id,id),FOREIGN KEY(tenant_id,run_id,recipient_fact_id,recipient_user_id) REFERENCES report_schedule_run_recipients(tenant_id,run_id,id,user_id)
);
CREATE TABLE report_schedule_events (
 tenant_id text NOT NULL,id text NOT NULL,schedule_id text NOT NULL,run_id text,recipient_fact_id text,action text NOT NULL,actor_id text,actor_name text NOT NULL,detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(detail)='object'),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,schedule_id) REFERENCES report_schedules(tenant_id,id),FOREIGN KEY(tenant_id,run_id) REFERENCES report_schedule_runs(tenant_id,id),FOREIGN KEY(tenant_id,recipient_fact_id) REFERENCES report_schedule_run_recipients(tenant_id,id),FOREIGN KEY(tenant_id,actor_id) REFERENCES memberships(tenant_id,user_id)
);
CREATE FUNCTION af_report_schedule_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Schedule identity is immutable' USING ERRCODE='23514'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER report_schedule_identity BEFORE UPDATE ON report_schedules FOR EACH ROW EXECUTE FUNCTION af_report_schedule_identity_guard();
CREATE FUNCTION af_report_schedule_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE schema jsonb;BEGIN
 SELECT schema_snapshot INTO schema FROM report_definition_versions WHERE tenant_id=NEW.tenant_id AND id=NEW.definition_version_id;
 IF NEW.schema_snapshot->>'version' IS DISTINCT FROM '1' OR NEW.schema_snapshot->>'definitionVersionId' IS DISTINCT FROM NEW.definition_version_id OR NEW.schema_snapshot->'timing'->>'timeZone' IS DISTINCT FROM schema->>'timeZone'
 OR NEW.schema_snapshot->>'format' NOT IN('csv','xlsx','pdf') OR NEW.schema_snapshot->>'dataWindow' NOT IN('previous-period','current-period') OR NEW.schema_snapshot->'recipients'->>'kind' NOT IN('tenant','role','department') THEN RAISE EXCEPTION 'Schedule must use a fixed published report and closed v1 schema' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER report_schedule_version_valid BEFORE INSERT ON report_schedule_versions FOR EACH ROW EXECUTE FUNCTION af_report_schedule_version_guard();
CREATE TRIGGER report_schedule_version_immutable BEFORE UPDATE OR DELETE ON report_schedule_versions FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE FUNCTION af_report_schedule_period_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE creator text;BEGIN
 SELECT created_by INTO creator FROM report_schedules WHERE tenant_id=NEW.tenant_id AND id=NEW.schedule_id;
 IF NEW.origin_id IS DISTINCT FROM creator THEN RAISE EXCEPTION 'Activation origin must be the original schedule creator' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' THEN
 IF ROW(NEW.tenant_id,NEW.id,NEW.schedule_id,NEW.rule_version_id,NEW.origin_id,NEW.started_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.schedule_id,OLD.rule_version_id,OLD.origin_id,OLD.started_at) OR (OLD.closed_at IS NOT NULL AND NEW.closed_at IS DISTINCT FROM OLD.closed_at) OR (OLD.cursor_at IS NULL AND NEW.cursor_at IS NOT NULL) OR (OLD.cursor_at IS NOT NULL AND NEW.cursor_at IS NOT NULL AND NEW.cursor_at<OLD.cursor_at) THEN RAISE EXCEPTION 'Activation history and cursor cannot be rewound' USING ERRCODE='23514';END IF;END IF;RETURN NEW;
END $$;
CREATE TRIGGER report_schedule_period_valid BEFORE INSERT OR UPDATE ON report_schedule_periods FOR EACH ROW EXECUTE FUNCTION af_report_schedule_period_guard();
CREATE FUNCTION af_report_schedule_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE period report_schedule_periods;BEGIN
 IF TG_OP='INSERT' THEN SELECT * INTO period FROM report_schedule_periods WHERE tenant_id=NEW.tenant_id AND id=NEW.period_id;
 IF NEW.created_by IS DISTINCT FROM period.origin_id OR NEW.schedule_id IS DISTINCT FROM period.schedule_id OR NEW.rule_version_id IS DISTINCT FROM period.rule_version_id OR NEW.slot_at<=period.started_at OR (period.closed_at IS NOT NULL AND NEW.slot_at>period.closed_at) OR NEW.slot_at IS DISTINCT FROM period.cursor_at THEN RAISE EXCEPTION 'Run must materialize the actual activation cursor' USING ERRCODE='23514';END IF;
 ELSE
 IF ROW(NEW.tenant_id,NEW.id,NEW.schedule_id,NEW.period_id,NEW.rule_version_id,NEW.slot_at,NEW.query,NEW.created_by,NEW.created_at,NEW.alert_outbox_id) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.schedule_id,OLD.period_id,OLD.rule_version_id,OLD.slot_at,OLD.query,OLD.created_by,OLD.created_at,OLD.alert_outbox_id) OR (OLD.recipients_resolved_at IS NOT NULL AND NEW.recipients_resolved_at IS DISTINCT FROM OLD.recipients_resolved_at) OR (OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at) OR (OLD.status IN('completed','cancelled') AND NEW.status IS DISTINCT FROM OLD.status) THEN RAISE EXCEPTION 'Run planning and terminal history are immutable' USING ERRCODE='23514';END IF;END IF;RETURN NEW;
END $$;
CREATE TRIGGER report_schedule_run_valid BEFORE INSERT OR UPDATE ON report_schedule_runs FOR EACH ROW EXECUTE FUNCTION af_report_schedule_run_guard();
CREATE FUNCTION af_report_schedule_recipient_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.run_id,NEW.user_id,NEW.notification_outbox_id) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.run_id,OLD.user_id,OLD.notification_outbox_id) OR (OLD.export_job_id IS NOT NULL AND NEW.export_job_id IS DISTINCT FROM OLD.export_job_id) OR (OLD.notification_id IS NOT NULL AND NEW.notification_id IS DISTINCT FROM OLD.notification_id) OR (OLD.notified_at IS NOT NULL AND NEW.notified_at IS DISTINCT FROM OLD.notified_at) OR (OLD.status IN('completed','cancelled') AND NEW.status IS DISTINCT FROM OLD.status) THEN RAISE EXCEPTION 'Fixed recipient, export and delivered facts are immutable' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER report_schedule_recipient_immutable BEFORE UPDATE ON report_schedule_run_recipients FOR EACH ROW EXECUTE FUNCTION af_report_schedule_recipient_guard();
CREATE FUNCTION af_report_schedule_completion_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status='completed' AND NOT EXISTS(SELECT 1 FROM report_export_jobs j JOIN report_export_artifacts a ON a.tenant_id=j.tenant_id AND a.job_id=j.id AND a.id=j.artifact_id JOIN notifications n ON n.tenant_id=j.tenant_id AND n.id=NEW.notification_id AND n.event_id=NEW.notification_outbox_id AND n.recipient_id=NEW.user_id JOIN outbox o ON o.tenant_id=n.tenant_id AND o.id=n.event_id WHERE j.tenant_id=NEW.tenant_id AND j.id=NEW.export_job_id AND j.status='completed' AND a.status='ready' AND a.expires_at>clock_timestamp() AND j.retention_until>clock_timestamp() AND o.status='sent' AND o.payload->>'source'='report-schedule' AND o.payload->>'reportExportJobId'=j.id AND o.payload->>'scheduleRunId'=NEW.run_id) THEN RAISE EXCEPTION 'Completed recipient requires current clean artifact and actual canonical notification' USING ERRCODE='23514';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER report_schedule_completion_valid AFTER INSERT OR UPDATE ON report_schedule_run_recipients DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION af_report_schedule_completion_guard();
CREATE FUNCTION af_report_schedule_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM report_schedule_run_recipients r JOIN report_schedule_runs run ON run.tenant_id=r.tenant_id AND run.id=r.run_id JOIN report_export_jobs j ON j.tenant_id=r.tenant_id AND j.id=NEW.job_id WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.recipient_fact_id AND r.run_id=NEW.run_id AND r.user_id=NEW.recipient_user_id AND r.export_job_id=j.id AND j.created_by=run.created_by AND j.definition_version_id=(SELECT schema_snapshot->>'definitionVersionId' FROM report_schedule_versions WHERE tenant_id=run.tenant_id AND id=run.rule_version_id)) THEN RAISE EXCEPTION 'Grant must bind the actual origin export and fixed run recipient' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER report_schedule_grant_valid BEFORE INSERT ON report_export_recipient_grants FOR EACH ROW EXECUTE FUNCTION af_report_schedule_grant_guard();
CREATE TRIGGER report_schedule_grant_immutable BEFORE UPDATE OR DELETE ON report_export_recipient_grants FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER report_schedule_no_delete BEFORE DELETE ON report_schedules FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER report_schedule_period_no_delete BEFORE DELETE ON report_schedule_periods FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER report_schedule_run_no_delete BEFORE DELETE ON report_schedule_runs FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER report_schedule_recipient_no_delete BEFORE DELETE ON report_schedule_run_recipients FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER report_schedule_events_immutable BEFORE UPDATE OR DELETE ON report_schedule_events FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE INDEX report_schedule_creator ON report_schedules(tenant_id,created_by,updated_at);
CREATE INDEX report_schedule_cursor ON report_schedule_periods(cursor_at) WHERE cursor_at IS NOT NULL;
CREATE INDEX report_schedule_run_claim ON report_schedule_runs(status,next_attempt_at,created_at);
CREATE INDEX report_schedule_recipient_claim ON report_schedule_run_recipients(status,next_attempt_at);
CREATE INDEX report_schedule_grantee ON report_export_recipient_grants(tenant_id,recipient_user_id,job_id);
CREATE FUNCTION af_report_schedule_grant_visible(subject_tenant text,subject_user text,subject_job text) RETURNS boolean LANGUAGE SQL STABLE AS $$
 WITH candidate AS MATERIALIZED (
 SELECT j.*,run.created_by AS origin_id,v.schema_snapshot AS rule,af_effective_permissions(j.tenant_id,run.created_by) AS origin_codes,af_effective_permissions(j.tenant_id,subject_user) AS receiver_codes
 FROM report_export_recipient_grants g JOIN report_export_jobs j ON j.tenant_id=g.tenant_id AND j.id=g.job_id JOIN report_schedule_runs run ON run.tenant_id=g.tenant_id AND run.id=g.run_id JOIN report_schedule_versions v ON v.tenant_id=run.tenant_id AND v.id=run.rule_version_id
 JOIN memberships receiver ON receiver.tenant_id=g.tenant_id AND receiver.user_id=g.recipient_user_id JOIN users ru ON ru.id=receiver.user_id
 JOIN memberships origin ON origin.tenant_id=run.tenant_id AND origin.user_id=run.created_by JOIN users ou ON ou.id=origin.user_id JOIN tenants t ON t.id=run.tenant_id
 JOIN report_definition_versions report ON report.tenant_id=j.tenant_id AND report.id=j.definition_version_id JOIN report_definitions definition ON definition.tenant_id=report.tenant_id AND definition.id=report.definition_id
 JOIN applications app ON app.tenant_id=j.tenant_id AND app.id=j.source_application_id
 WHERE g.tenant_id=subject_tenant AND g.job_id=subject_job AND g.recipient_user_id=subject_user AND t.status='enabled' AND origin.status='enabled' AND origin.deleted_at IS NULL AND ou.status='enabled' AND receiver.status='enabled' AND receiver.deleted_at IS NULL AND ru.status='enabled'
 AND definition.enabled AND app.status='enabled' AND app.business_kind='generic' AND app.active_release_id IS NOT NULL
 AND af_member_scope_visible(subject_tenant,run.created_by,'report:schedule:create',subject_user)
 AND ((v.schema_snapshot->'recipients'->>'kind')='tenant'
 OR ((v.schema_snapshot->'recipients'->>'kind')='role' AND EXISTS(SELECT 1 FROM member_roles mr JOIN roles role ON role.tenant_id=mr.tenant_id AND role.id=mr.role_id WHERE mr.tenant_id=subject_tenant AND mr.user_id=subject_user AND role.id=v.schema_snapshot->'recipients'->>'roleId' AND role.status='enabled' AND role.deleted_at IS NULL))
 OR ((v.schema_snapshot->'recipients'->>'kind')='department' AND receiver.department_id=v.schema_snapshot->'recipients'->>'departmentId' AND EXISTS(SELECT 1 FROM departments d WHERE d.tenant_id=subject_tenant AND d.id=receiver.department_id AND d.status='enabled' AND d.deleted_at IS NULL)))
 ), admitted AS MATERIALIZED (SELECT * FROM candidate WHERE (origin_codes ? '*' OR origin_codes ?& ARRAY['report:schedule:create','report:export:create','report:query']) AND (receiver_codes ? '*' OR receiver_codes ?& ARRAY['report:query','report:export:list','report:export:download'])
 AND (origin_codes ? 'business:read:self' OR origin_codes ? '*' OR (origin_codes ?| ARRAY['workflow:todo','workflow:approve','workflow:reject'] AND EXISTS(SELECT 1 FROM business_records source_record WHERE source_record.tenant_id=candidate.tenant_id AND source_record.application_release_id=candidate.source_release_id AND source_record.record_kind='generic' AND af_record_visible(candidate.tenant_id,candidate.origin_id,source_record.id))))
 AND (receiver_codes ? 'business:read:self' OR receiver_codes ? '*' OR (receiver_codes ?| ARRAY['workflow:todo','workflow:approve','workflow:reject'] AND EXISTS(SELECT 1 FROM business_records source_record WHERE source_record.tenant_id=candidate.tenant_id AND source_record.application_release_id=candidate.source_release_id AND source_record.record_kind='generic' AND af_record_visible(candidate.tenant_id,subject_user,source_record.id))))
 AND (NOT(snapshot ? 'producerVersion') OR snapshot->'producerVersion' IN('1'::jsonb,'2'::jsonb))
 AND ((query->'sort'->'field'->>'kind')<>'field' OR ((origin_codes ? 'report:field:business' OR origin_codes ? '*') AND (receiver_codes ? 'report:field:business' OR receiver_codes ? '*')))
 AND ((query->'sort'->'field'->>'kind')<>'metadata' OR (query->'sort'->'field'->>'id') NOT IN('applicantId','applicantName','departmentSnapshot') OR ((origin_codes ? 'report:field:applicant' OR origin_codes ? '*') AND (receiver_codes ? 'report:field:applicant' OR receiver_codes ? '*'))))
 SELECT EXISTS(SELECT 1 FROM admitted j WHERE NOT EXISTS(
 SELECT 1 FROM jsonb_to_recordset(j.authorization_manifest) captured(id text,"applicantId" text,"allowedFieldKeys" jsonb) LEFT JOIN business_records r ON r.tenant_id=j.tenant_id AND r.id=captured.id
 WHERE r.id IS NULL OR r.applicant_id IS DISTINCT FROM captured."applicantId" OR r.application_release_id IS DISTINCT FROM j.source_release_id OR NOT af_record_visible(j.tenant_id,j.origin_id,r.id) OR NOT af_record_visible(j.tenant_id,subject_user,r.id)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(j.snapshot->'columns') column_fact WHERE captured."allowedFieldKeys" ? (column_fact->>'key') AND (
 ((column_fact->'reference'->>'kind')='field' AND (NOT(j.origin_codes ? 'report:field:business' OR j.origin_codes ? '*') OR NOT(j.receiver_codes ? 'report:field:business' OR j.receiver_codes ? '*') OR NOT af_member_scope_visible(j.tenant_id,j.origin_id,'report:field:business',r.applicant_id) OR NOT af_member_scope_visible(j.tenant_id,subject_user,'report:field:business',r.applicant_id)))
 OR ((column_fact->'reference'->>'kind')='metadata' AND column_fact->'reference'->>'id' IN('applicantId','applicantName','departmentSnapshot') AND (
 NOT(j.origin_codes ? 'report:field:applicant' OR j.origin_codes ? '*') OR NOT(j.receiver_codes ? 'report:field:applicant' OR j.receiver_codes ? '*') OR NOT af_member_field_visible(j.tenant_id,j.origin_id,'report:field:applicant',r.applicant_id,CASE column_fact->'reference'->>'id' WHEN 'applicantId' THEN 'username' WHEN 'applicantName' THEN 'name' ELSE 'dept' END)
 OR NOT af_member_field_visible(j.tenant_id,subject_user,'report:field:applicant',r.applicant_id,CASE column_fact->'reference'->>'id' WHEN 'applicantId' THEN 'username' WHEN 'applicantName' THEN 'name' ELSE 'dept' END)))))
 ))
$$;
CREATE OR REPLACE FUNCTION af_messaging_notification_visible(subject_tenant text,subject_user text,notification text) RETURNS boolean LANGUAGE SQL STABLE AS $$
 SELECT ((NOT EXISTS(SELECT 1 FROM outbox o JOIN notifications n ON n.tenant_id=o.tenant_id AND n.event_id=o.id WHERE n.tenant_id=subject_tenant AND n.id=notification AND o.payload->>'source' IN('report-schedule','report-schedule-alert')))
 OR EXISTS(SELECT 1 FROM outbox o JOIN notifications n ON n.tenant_id=o.tenant_id AND n.event_id=o.id WHERE n.tenant_id=subject_tenant AND n.id=notification AND n.recipient_id=subject_user AND o.payload->>'source'='report-schedule' AND af_report_schedule_grant_visible(subject_tenant,subject_user,o.payload->>'reportExportJobId'))
 OR EXISTS(SELECT 1 FROM outbox o JOIN notifications n ON n.tenant_id=o.tenant_id AND n.event_id=o.id JOIN report_schedule_runs run ON run.tenant_id=o.tenant_id AND run.id=o.payload->>'scheduleRunId' WHERE n.tenant_id=subject_tenant AND n.id=notification AND n.recipient_id=subject_user AND o.payload->>'source'='report-schedule-alert' AND af_historical_member_scope_visible(subject_tenant,subject_user,'report:schedule:run:read',run.created_by)))
 AND (NOT EXISTS(SELECT 1 FROM message_recipients r WHERE r.tenant_id=subject_tenant AND r.notification_id=notification) OR EXISTS(
 SELECT 1 FROM message_recipients r JOIN message_send_jobs j ON j.tenant_id=r.tenant_id AND j.id=r.job_id JOIN memberships m ON m.tenant_id=r.tenant_id AND m.user_id=r.user_id JOIN users u ON u.id=m.user_id
 LEFT JOIN message_announcement_versions av ON av.tenant_id=j.tenant_id AND av.id=j.announcement_version_id LEFT JOIN message_announcements a ON a.tenant_id=av.tenant_id AND a.id=av.announcement_id
 WHERE r.tenant_id=subject_tenant AND r.user_id=subject_user AND r.notification_id=notification AND r.status='sent' AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled'
 AND (j.source_kind='template' OR (a.status='published' AND a.active_version_id=av.id AND av.audience_snapshot ? subject_user AND (af_effective_permissions(subject_tenant,subject_user) ? 'message:announcement:read' OR af_effective_permissions(subject_tenant,subject_user) ? '*') AND ((av.schema_snapshot->>'expiresAt') IS NULL OR (av.schema_snapshot->>'expiresAt')::timestamptz>now())))
 AND ((j.audience->>'scope')='all' OR ((j.audience->>'scope')='self' AND j.sender_id=subject_user) OR ((j.audience->>'scope')='users' AND j.audience->'userIds' ? subject_user)
 OR ((j.audience->>'scope')='role' AND EXISTS(SELECT 1 FROM member_roles mr JOIN roles role ON role.tenant_id=mr.tenant_id AND role.id=mr.role_id WHERE mr.tenant_id=subject_tenant AND mr.user_id=subject_user AND role.id=j.audience->>'targetId' AND role.status='enabled' AND role.deleted_at IS NULL))
 OR ((j.audience->>'scope')='department' AND m.department_id=j.audience->>'targetId' AND EXISTS(SELECT 1 FROM departments d WHERE d.tenant_id=subject_tenant AND d.id=m.department_id AND d.status='enabled' AND d.deleted_at IS NULL)))
 ))
$$;
INSERT INTO permission_definitions(code,title,module) VALUES
('report:schedule:list','查看定时报表规则','定时报表'),('report:schedule:create','创建定时报表','定时报表'),('report:schedule:update','编辑定时报表版本','定时报表'),('report:schedule:toggle','启停定时报表','定时报表'),
('report:schedule:run:read','读取定时报表运行事实','定时报表'),('report:schedule:run:retry','重试定时报表运行','定时报表'),('report:schedule:run:cancel','取消定时报表运行','定时报表');
INSERT INTO menu_route_catalogue(key,path,component_key,parent_key,locale,permissions,permission_mode,menu_type,default_order,protected) VALUES
('reportSchedules','/visualization/reportSchedules','ReportSchedulesPage','visualization','menu.visualization.reportSchedules','["report:schedule:list","report:schedule:run:read"]'::jsonb,'any','menu',1,false);
INSERT INTO menu_resources(tenant_id,id,menu_name,menu_type,route_key,parent_id,sort)
 SELECT t.id,'default-'||r.key,r.locale,r.menu_type,r.key,'default-'||r.parent_key,r.default_order
 FROM tenants t CROSS JOIN menu_route_catalogue r WHERE r.key='reportSchedules';

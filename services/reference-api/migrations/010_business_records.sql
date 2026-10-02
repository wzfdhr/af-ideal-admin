INSERT INTO permission_definitions(code,title,module) VALUES
 ('business:read:self','查看本人和参与的业务记录','业务运行'),
 ('business:create','创建本人业务记录','业务运行'),
 ('business:update:self','编辑本人业务草稿','业务运行'),
 ('business:submit','提交本人业务记录','业务运行'),
 ('business:withdraw:self','撤回本人业务记录','业务运行');
-- Keep one authoritative status and identity. Existing FKs follow the renamed table OID.
ALTER TABLE leave_requests RENAME TO business_records;
ALTER TABLE business_records ADD COLUMN record_kind text NOT NULL DEFAULT 'leave' CHECK(record_kind IN ('leave','generic'));
ALTER TABLE business_records ALTER COLUMN half_day_units DROP NOT NULL;
ALTER TABLE business_records DROP CONSTRAINT leave_requests_half_day_units_check;
ALTER TABLE business_records ADD CONSTRAINT business_record_shape CHECK(
 (record_kind='leave' AND half_day_units IS NOT NULL AND half_day_units BETWEEN 1 AND 732)
 OR (record_kind='generic' AND half_day_units IS NULL));
ALTER TABLE business_records ADD CONSTRAINT business_fields_object CHECK(jsonb_typeof(fields)='object');
ALTER TABLE business_records ADD CONSTRAINT business_record_release_key UNIQUE(tenant_id,id,application_release_id);
ALTER TABLE workflow_instances ADD CONSTRAINT instance_business_release_fk
 FOREIGN KEY(tenant_id,request_id,release_id) REFERENCES business_records(tenant_id,id,application_release_id);
CREATE FUNCTION validate_business_record_kind() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE release_kind text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.record_kind<>OLD.record_kind THEN
  RAISE EXCEPTION 'Record kind is immutable' USING ERRCODE='23514';
 END IF;
 SELECT a.business_kind INTO release_kind FROM application_releases r JOIN applications a ON a.tenant_id=r.tenant_id AND a.id=r.application_id
  WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.application_release_id;
 IF FOUND AND release_kind<>NEW.record_kind THEN
  RAISE EXCEPTION 'Business record and release kind differ' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER business_record_kind_guard BEFORE INSERT OR UPDATE OF record_kind,application_release_id ON business_records
 FOR EACH ROW EXECUTE FUNCTION validate_business_record_kind();
CREATE VIEW leave_requests AS SELECT tenant_id,id,application_release_id,applicant_id,applicant_name,
 department_snapshot,fields,half_day_units,status,revision,previous_request_id,created_at,updated_at
 FROM business_records WHERE record_kind='leave' WITH LOCAL CHECK OPTION;

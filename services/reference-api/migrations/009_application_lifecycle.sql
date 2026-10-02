INSERT INTO permission_definitions(code,title,module) VALUES
 ('application:list','查看应用中心','应用'),('application:create','创建应用','应用'),
 ('application:copy','独立复制应用','应用'),('application:archive','归档和恢复应用','应用');
ALTER TABLE applications
 ADD COLUMN description text NOT NULL DEFAULT '',
 ADD COLUMN business_kind text NOT NULL DEFAULT 'leave' CHECK(business_kind IN ('leave','generic')),
 ADD COLUMN status text NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','archived')),
 ADD COLUMN form_draft_id text,
 ADD COLUMN workflow_draft_id text,
 ADD CONSTRAINT application_form_draft_fk FOREIGN KEY(tenant_id,form_draft_id) REFERENCES form_drafts(tenant_id,id),
 ADD CONSTRAINT application_workflow_draft_fk FOREIGN KEY(tenant_id,workflow_draft_id) REFERENCES workflow_drafts(tenant_id,id);
UPDATE applications a SET form_draft_id='form-leave',workflow_draft_id='workflow-leave'
 WHERE a.id='leave' AND EXISTS(SELECT 1 FROM form_drafts f WHERE f.tenant_id=a.tenant_id AND f.id='form-leave')
 AND EXISTS(SELECT 1 FROM workflow_drafts w WHERE w.tenant_id=a.tenant_id AND w.id='workflow-leave');

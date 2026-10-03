INSERT INTO permission_definitions(code,title,module) VALUES
 ('workflow:transfer','转交本人待办','审批'),('workflow:recover','恢复授权范围内异常审批','审批');
ALTER TABLE workflow_tasks ADD COLUMN original_assignee_id text;
UPDATE workflow_tasks SET original_assignee_id=assignee_id;
ALTER TABLE workflow_tasks ALTER COLUMN original_assignee_id SET NOT NULL;
ALTER TABLE workflow_tasks ADD FOREIGN KEY(tenant_id,original_assignee_id) REFERENCES memberships(tenant_id,user_id);
CREATE TABLE workflow_assignment_overrides (
 tenant_id text NOT NULL,instance_id text NOT NULL,node_id text NOT NULL,original_assignee_id text NOT NULL,target_user_id text NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,instance_id,node_id,original_assignee_id),
 FOREIGN KEY(tenant_id,instance_id) REFERENCES workflow_instances(tenant_id,id),
 FOREIGN KEY(tenant_id,original_assignee_id) REFERENCES memberships(tenant_id,user_id),
 FOREIGN KEY(tenant_id,target_user_id) REFERENCES memberships(tenant_id,user_id)
);
CREATE TABLE workflow_assignment_events (
 tenant_id text NOT NULL,id text NOT NULL,instance_id text NOT NULL,task_id text,decision_task_id text,node_id text NOT NULL,
 original_assignee_id text NOT NULL,from_user_id text NOT NULL,to_user_id text NOT NULL,actor_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('transfer','recover-task','recover-next')),reason text NOT NULL CHECK(length(reason) BETWEEN 2 AND 500),
 task_revision integer NOT NULL CHECK(task_revision>0),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,instance_id) REFERENCES workflow_instances(tenant_id,id),
 FOREIGN KEY(tenant_id,instance_id,task_id) REFERENCES workflow_tasks(tenant_id,instance_id,id),
 FOREIGN KEY(tenant_id,instance_id,decision_task_id) REFERENCES workflow_tasks(tenant_id,instance_id,id),
 FOREIGN KEY(tenant_id,original_assignee_id) REFERENCES memberships(tenant_id,user_id),
 FOREIGN KEY(tenant_id,from_user_id) REFERENCES memberships(tenant_id,user_id),
 FOREIGN KEY(tenant_id,to_user_id) REFERENCES memberships(tenant_id,user_id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES memberships(tenant_id,user_id)
);
CREATE INDEX workflow_assignment_reader ON workflow_assignment_events(tenant_id,instance_id,from_user_id,to_user_id);
CREATE FUNCTION af_assignment_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Workflow assignment facts are immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER assignment_history_immutable BEFORE UPDATE OR DELETE ON workflow_assignment_events FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
ALTER TABLE workflow_history DROP CONSTRAINT workflow_history_action_check;
ALTER TABLE workflow_history ADD CONSTRAINT workflow_history_action_check
 CHECK(action IN ('start','approve','reject','withdraw','copy','route','fork','join','sign','cancel','transfer','recover'));
CREATE FUNCTION af_task_original_slot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.original_assignee_id IS NULL THEN NEW.original_assignee_id=NEW.assignee_id; END IF;
 IF TG_OP='UPDATE' AND NEW.original_assignee_id IS DISTINCT FROM OLD.original_assignee_id THEN
  RAISE EXCEPTION 'Original approval slot is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER task_original_slot BEFORE INSERT OR UPDATE ON workflow_tasks FOR EACH ROW EXECUTE FUNCTION af_task_original_slot();

CREATE FUNCTION af_historical_member_scope_visible(subject_tenant text,subject_user text,required_code text,target_user text,selected_role text DEFAULT NULL) RETURNS boolean LANGUAGE SQL STABLE AS $$
 WITH RECURSIVE subject AS (
  SELECT * FROM memberships WHERE tenant_id=subject_tenant AND user_id=subject_user AND status='enabled' AND deleted_at IS NULL
 ), target AS (
  SELECT * FROM memberships WHERE tenant_id=subject_tenant AND user_id=target_user
 ), permitted_roles AS (
  SELECT r.id,COALESCE(s.data_scope,'self') AS data_scope FROM subject m
  JOIN member_roles mr ON mr.tenant_id=m.tenant_id AND mr.user_id=m.user_id
  JOIN roles r ON r.tenant_id=mr.tenant_id AND r.id=mr.role_id
  JOIN role_permissions rp ON rp.tenant_id=r.tenant_id AND rp.role_id=r.id AND rp.permission_code=required_code
  JOIN permission_definitions p ON p.code=rp.permission_code AND p.status='enabled'
  LEFT JOIN role_member_scopes s ON s.tenant_id=r.tenant_id AND s.role_id=r.id
  WHERE r.status='enabled' AND r.deleted_at IS NULL AND (selected_role IS NULL OR r.id=selected_role)
 ), roots AS (
  SELECT pr.id AS role_id,pr.data_scope,sd.department_id FROM permitted_roles pr JOIN role_scope_departments sd ON sd.tenant_id=subject_tenant AND sd.role_id=pr.id
  UNION
  SELECT pr.id,pr.data_scope,m.department_id FROM permitted_roles pr CROSS JOIN subject m WHERE m.department_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM role_scope_departments sd WHERE sd.tenant_id=subject_tenant AND sd.role_id=pr.id)
 ), allowed_departments AS (
  SELECT role_id,data_scope,department_id FROM roots
  UNION
  SELECT a.role_id,a.data_scope,d.id FROM allowed_departments a JOIN departments d ON d.tenant_id=subject_tenant AND d.parent_id=a.department_id AND d.deleted_at IS NULL WHERE a.data_scope='department-and-children'
 )
 SELECT EXISTS(SELECT 1 FROM subject m CROSS JOIN target t WHERE
  (selected_role IS NULL AND (m.permissions ? required_code OR m.permissions ? '*')) OR EXISTS (
   SELECT 1 FROM permitted_roles pr WHERE pr.data_scope IN ('all','tenant') OR (pr.data_scope='self' AND t.user_id=m.user_id) OR
   (pr.data_scope IN ('department','department-and-children') AND EXISTS(SELECT 1 FROM allowed_departments a WHERE a.role_id=pr.id AND a.department_id=t.department_id))
  ))
$$;

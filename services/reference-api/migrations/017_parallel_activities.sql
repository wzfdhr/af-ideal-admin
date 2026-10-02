CREATE TABLE workflow_activities (
  tenant_id text NOT NULL,
  id text NOT NULL,
  instance_id text NOT NULL,
  node_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('approval','sign','fork')),
  status text NOT NULL CHECK (status IN ('waiting','completed','cancelled','rejected')),
  parent_group_id text,
  branch_key text,
  threshold integer CHECK (threshold > 0),
  expected_branches integer CHECK (expected_branches BETWEEN 2 AND 10),
  join_node_id text,
  arrived_branches jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(arrived_branches)='array'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,instance_id,id),
  UNIQUE (tenant_id,instance_id,node_id),
  FOREIGN KEY (tenant_id,instance_id) REFERENCES workflow_instances(tenant_id,id),
  FOREIGN KEY (tenant_id,instance_id,parent_group_id) REFERENCES workflow_activities(tenant_id,instance_id,id),
  CHECK ((parent_group_id IS NULL)=(branch_key IS NULL)),
  CHECK ((kind='fork')=(join_node_id IS NOT NULL AND expected_branches IS NOT NULL)),
  CHECK ((kind IN ('approval','sign'))=(threshold IS NOT NULL))
);
ALTER TABLE workflow_tasks ADD COLUMN activity_id text;
ALTER TABLE workflow_tasks ADD FOREIGN KEY (tenant_id,instance_id,activity_id)
  REFERENCES workflow_activities(tenant_id,instance_id,id);
ALTER TABLE workflow_tasks DROP CONSTRAINT workflow_tasks_tenant_id_instance_id_node_id_key;
ALTER TABLE workflow_tasks ADD UNIQUE (tenant_id,instance_id,node_id,assignee_id);
CREATE INDEX workflow_activities_waiting ON workflow_activities(tenant_id,instance_id,status);
CREATE INDEX workflow_tasks_activity ON workflow_tasks(tenant_id,activity_id,status);
ALTER TABLE workflow_history DROP CONSTRAINT workflow_history_action_check;
ALTER TABLE workflow_history ADD CONSTRAINT workflow_history_action_check
  CHECK (action IN ('start','approve','reject','withdraw','copy','route','fork','join','sign','cancel'));
CREATE UNIQUE INDEX workflow_tasks_legacy_node ON workflow_tasks(tenant_id,instance_id,node_id)
  WHERE activity_id IS NULL;

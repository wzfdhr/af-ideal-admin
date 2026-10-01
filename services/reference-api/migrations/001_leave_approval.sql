CREATE TABLE tenants (
  id text PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships (
  tenant_id text NOT NULL REFERENCES tenants(id),
  user_id text NOT NULL REFERENCES users(id),
  department_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'user', 'operator', 'restricted')),
  permissions jsonb NOT NULL CHECK (jsonb_typeof(permissions) = 'array'),
  status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  default_tenant_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (default_tenant_id, user_id) REFERENCES memberships(tenant_id, user_id)
);
CREATE TABLE applications (
  tenant_id text NOT NULL REFERENCES tenants(id),
  id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  active_release_id text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, code)
);
CREATE TABLE form_drafts (
  tenant_id text NOT NULL REFERENCES tenants(id),
  id text NOT NULL,
  name text NOT NULL,
  schema jsonb NOT NULL CHECK (jsonb_typeof(schema) = 'object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE TABLE workflow_drafts (
  tenant_id text NOT NULL REFERENCES tenants(id),
  id text NOT NULL,
  name text NOT NULL,
  schema jsonb NOT NULL CHECK (jsonb_typeof(schema) = 'object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE TABLE application_releases (
  tenant_id text NOT NULL,
  id text NOT NULL,
  application_id text NOT NULL,
  release_version integer NOT NULL CHECK (release_version > 0),
  form_snapshot jsonb NOT NULL,
  workflow_snapshot jsonb NOT NULL,
  content_hash text NOT NULL,
  published_by text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, application_id, release_version),
  UNIQUE (tenant_id, application_id, id),
  FOREIGN KEY (tenant_id, application_id) REFERENCES applications(tenant_id, id),
  FOREIGN KEY (tenant_id, published_by) REFERENCES memberships(tenant_id, user_id)
);
ALTER TABLE applications ADD CONSTRAINT application_active_release_fk
  FOREIGN KEY (tenant_id, id, active_release_id)
  REFERENCES application_releases(tenant_id, application_id, id);
CREATE FUNCTION reject_release_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published releases are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER release_immutable BEFORE UPDATE OR DELETE ON application_releases
  FOR EACH ROW EXECUTE FUNCTION reject_release_mutation();
CREATE TABLE leave_requests (
  tenant_id text NOT NULL,
  id text NOT NULL,
  application_release_id text NOT NULL,
  applicant_id text NOT NULL,
  applicant_name text NOT NULL,
  department_snapshot text NOT NULL,
  fields jsonb NOT NULL,
  half_day_units integer NOT NULL CHECK (half_day_units BETWEEN 1 AND 732),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'approved', 'rejected', 'withdrawn')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  previous_request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, application_release_id) REFERENCES application_releases(tenant_id, id),
  FOREIGN KEY (tenant_id, applicant_id) REFERENCES memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, previous_request_id) REFERENCES leave_requests(tenant_id, id)
);
CREATE TABLE workflow_instances (
  tenant_id text NOT NULL,
  id text NOT NULL,
  request_id text NOT NULL,
  release_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'rejected', 'withdrawn')),
  current_node_id text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, request_id),
  FOREIGN KEY (tenant_id, request_id) REFERENCES leave_requests(tenant_id, id),
  FOREIGN KEY (tenant_id, release_id) REFERENCES application_releases(tenant_id, id)
);
CREATE TABLE workflow_tasks (
  tenant_id text NOT NULL,
  id text NOT NULL,
  instance_id text NOT NULL,
  node_id text NOT NULL,
  node_name text NOT NULL,
  assignee_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, instance_id, node_id),
  UNIQUE (tenant_id, instance_id, id),
  FOREIGN KEY (tenant_id, instance_id) REFERENCES workflow_instances(tenant_id, id),
  FOREIGN KEY (tenant_id, assignee_id) REFERENCES memberships(tenant_id, user_id)
);
CREATE TABLE workflow_history (
  tenant_id text NOT NULL,
  id text NOT NULL,
  instance_id text NOT NULL,
  task_id text,
  action text NOT NULL CHECK (action IN ('start', 'approve', 'reject', 'withdraw', 'copy')),
  operator_id text NOT NULL,
  operator_name text NOT NULL,
  comment text NOT NULL DEFAULT '',
  sequence integer NOT NULL CHECK (sequence > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, instance_id, sequence),
  FOREIGN KEY (tenant_id, instance_id) REFERENCES workflow_instances(tenant_id, id),
  FOREIGN KEY (tenant_id, instance_id, task_id) REFERENCES workflow_tasks(tenant_id, instance_id, id),
  FOREIGN KEY (tenant_id, operator_id) REFERENCES memberships(tenant_id, user_id)
);
CREATE TABLE audit_events (
  tenant_id text NOT NULL REFERENCES tenants(id),
  id text NOT NULL,
  actor_id text REFERENCES users(id),
  actor_name text NOT NULL,
  module text NOT NULL,
  action text NOT NULL,
  result text NOT NULL CHECK (result IN ('success', 'failure')),
  target_type text NOT NULL,
  target_id text,
  trace_id text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE TABLE outbox (
  tenant_id text NOT NULL REFERENCES tenants(id),
  id text NOT NULL,
  recipient_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  claimed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, id, recipient_id),
  FOREIGN KEY (tenant_id, recipient_id) REFERENCES memberships(tenant_id, user_id)
);
CREATE TABLE notifications (
  tenant_id text NOT NULL,
  id text NOT NULL,
  event_id text NOT NULL,
  recipient_id text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  category text NOT NULL,
  link text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, event_id, recipient_id),
  FOREIGN KEY (tenant_id, event_id, recipient_id) REFERENCES outbox(tenant_id, id, recipient_id)
);
CREATE TABLE idempotency_records (
  tenant_id text NOT NULL,
  actor_id text NOT NULL,
  operation text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  PRIMARY KEY (tenant_id, actor_id, operation, key),
  FOREIGN KEY (tenant_id, actor_id) REFERENCES memberships(tenant_id, user_id)
);
CREATE INDEX request_owner_list ON leave_requests (tenant_id, applicant_id, updated_at DESC, id);
CREATE INDEX task_assignee_list ON workflow_tasks (tenant_id, assignee_id, status, created_at DESC, id);
CREATE INDEX history_instance_order ON workflow_history (tenant_id, instance_id, sequence);
CREATE INDEX outbox_pending_poll ON outbox (status, next_attempt_at, lease_until);
CREATE INDEX notification_recipient ON notifications (tenant_id, recipient_id, created_at DESC, id);
CREATE INDEX audit_tenant_time ON audit_events (tenant_id, created_at DESC, id);

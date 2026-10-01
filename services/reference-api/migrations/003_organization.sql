CREATE TABLE departments (
  tenant_id text NOT NULL REFERENCES tenants(id),
  id text NOT NULL,
  parent_id text,
  department_name text NOT NULL,
  leader text NOT NULL DEFAULT '',
  sort integer NOT NULL DEFAULT 1 CHECK (sort BETWEEN 0 AND 100000),
  status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled','disabled')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,parent_id) REFERENCES departments(tenant_id,id),
  CHECK (parent_id IS NULL OR parent_id<>id)
);
CREATE UNIQUE INDEX department_live_name ON departments (tenant_id,parent_id,department_name) NULLS NOT DISTINCT WHERE deleted_at IS NULL;
CREATE INDEX department_tree ON departments (tenant_id,parent_id,sort,id) WHERE deleted_at IS NULL;
ALTER TABLE memberships ADD COLUMN department_id text;
INSERT INTO departments (tenant_id,id,department_name)
  SELECT DISTINCT tenant_id,'legacy-dept-'||md5(tenant_id||':'||department_name),department_name FROM memberships;
UPDATE memberships SET department_id='legacy-dept-'||md5(tenant_id||':'||department_name);
ALTER TABLE memberships ADD CONSTRAINT membership_department_fk FOREIGN KEY (tenant_id,department_id) REFERENCES departments(tenant_id,id);

CREATE TABLE positions (
  tenant_id text NOT NULL,
  id text NOT NULL,
  department_id text NOT NULL,
  position_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('enabled','disabled')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,department_id,id),
  FOREIGN KEY (tenant_id,department_id) REFERENCES departments(tenant_id,id)
);
CREATE UNIQUE INDEX position_live_name ON positions (tenant_id,department_id,position_name) WHERE deleted_at IS NULL;
ALTER TABLE memberships ADD COLUMN position_id text;
ALTER TABLE memberships ADD CONSTRAINT membership_position_fk FOREIGN KEY (tenant_id,department_id,position_id) REFERENCES positions(tenant_id,department_id,id);
ALTER TABLE memberships ADD CONSTRAINT membership_position_requires_department CHECK (position_id IS NULL OR department_id IS NOT NULL);

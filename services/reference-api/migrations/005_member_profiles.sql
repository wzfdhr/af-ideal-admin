ALTER TABLE users ADD COLUMN owner_tenant_id text REFERENCES tenants(id);
ALTER TABLE memberships ADD COLUMN display_name text CHECK (length(display_name) BETWEEN 1 AND 100);
ALTER TABLE memberships ADD COLUMN phone text NOT NULL DEFAULT '' CHECK (length(phone)<=30);
ALTER TABLE memberships ADD COLUMN email text NOT NULL DEFAULT '' CHECK (length(email)<=254);
ALTER TABLE memberships ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE memberships ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE memberships ADD COLUMN deleted_at timestamptz;
ALTER TABLE memberships ADD COLUMN session_epoch integer NOT NULL DEFAULT 1 CHECK (session_epoch>0);
ALTER TABLE memberships ADD CONSTRAINT deleted_member_disabled CHECK (deleted_at IS NULL OR status='disabled');
CREATE INDEX live_memberships ON memberships(tenant_id,user_id) WHERE deleted_at IS NULL;
CREATE TABLE session_scopes (
  token_hash text NOT NULL REFERENCES sessions(token_hash),
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  epoch integer NOT NULL CHECK (epoch>0),
  PRIMARY KEY (token_hash,tenant_id),
  FOREIGN KEY (tenant_id,user_id) REFERENCES memberships(tenant_id,user_id)
);
INSERT INTO session_scopes (token_hash,tenant_id,user_id,epoch)
  SELECT s.token_hash,m.tenant_id,s.user_id,m.session_epoch
  FROM sessions s JOIN memberships m ON m.user_id=s.user_id JOIN users u ON u.id=s.user_id JOIN tenants t ON t.id=m.tenant_id
  WHERE s.revoked_at IS NULL AND s.expires_at>now() AND m.status='enabled' AND u.status='enabled' AND t.status='enabled';

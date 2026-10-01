ALTER TABLE users ADD COLUMN credential_revision integer NOT NULL DEFAULT 1 CHECK (credential_revision>0);

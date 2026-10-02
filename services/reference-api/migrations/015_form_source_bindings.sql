CREATE TABLE form_draft_sources (
  tenant_id text NOT NULL,
  form_draft_id text NOT NULL,
  source_key text NOT NULL,
  source_id text NOT NULL,
  PRIMARY KEY(tenant_id,form_draft_id,source_key),
  FOREIGN KEY(tenant_id,form_draft_id) REFERENCES form_drafts(tenant_id,id),
  FOREIGN KEY(tenant_id,source_id) REFERENCES form_data_sources(tenant_id,id)
);
CREATE TABLE release_form_sources (
  tenant_id text NOT NULL,
  release_id text NOT NULL,
  source_key text NOT NULL,
  source_id text NOT NULL,
  source_revision integer NOT NULL CHECK(source_revision>0),
  dictionary_revision integer NOT NULL CHECK(dictionary_revision>0),
  PRIMARY KEY(tenant_id,release_id,source_key),
  FOREIGN KEY(tenant_id,release_id) REFERENCES application_releases(tenant_id,id),
  FOREIGN KEY(tenant_id,source_id) REFERENCES form_data_sources(tenant_id,id)
);

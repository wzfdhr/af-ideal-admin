CREATE TABLE form_data_sources (
  tenant_id text NOT NULL REFERENCES tenants(id),
  id text NOT NULL,
  code text NOT NULL CHECK(code ~ '^[a-z][a-z0-9-]{0,59}$'),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  kind text NOT NULL DEFAULT 'dictionary' CHECK(kind='dictionary'),
  dictionary_id text NOT NULL,
  status text NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','disabled')),
  description text NOT NULL DEFAULT '' CHECK(length(description)<=500),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,code),
  FOREIGN KEY(tenant_id,dictionary_id) REFERENCES dictionaries(tenant_id,id)
);
INSERT INTO permission_definitions(code,title,module) VALUES
 ('form-source:list','查看数据源登记','表单数据源'),('form-source:create','登记受控数据源','表单数据源'),
 ('form-source:update','维护与启停数据源','表单数据源'),('form-source:read','查询授权数据源','表单数据源');

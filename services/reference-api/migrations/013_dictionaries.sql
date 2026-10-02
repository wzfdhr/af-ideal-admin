CREATE TABLE dictionaries (
  tenant_id text NOT NULL REFERENCES tenants(id),
  id text NOT NULL,
  dict_name text NOT NULL CHECK(length(dict_name) BETWEEN 1 AND 100),
  dict_type text NOT NULL CHECK(dict_type ~ '^[a-z][a-z0-9-]{0,59}$'),
  status text NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','disabled')),
  description text NOT NULL DEFAULT '' CHECK(length(description)<=500),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,dict_type)
);
CREATE TABLE dictionary_items (
  tenant_id text NOT NULL,
  dictionary_id text NOT NULL,
  ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 199),
  label text NOT NULL CHECK(length(label) BETWEEN 1 AND 100),
  value jsonb NOT NULL CHECK(jsonb_typeof(value) IN ('string','number','boolean')),
  disabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY(tenant_id,dictionary_id,ordinal),
  UNIQUE(tenant_id,dictionary_id,value),
  FOREIGN KEY(tenant_id,dictionary_id) REFERENCES dictionaries(tenant_id,id)
);
INSERT INTO permission_definitions(code,title,module) VALUES
 ('system:dict:list','查看字典列表','字典'),('system:dict:detail','查看字典详情及选项','字典'),
 ('system:dict:create','创建字典','字典'),('system:dict:update','更新字典和选项','字典'),
 ('system:dict:delete','删除字典','字典'),('system:dict:read','读取运行字典选项','字典')
ON CONFLICT(code) DO NOTHING;

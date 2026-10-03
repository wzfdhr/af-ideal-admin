INSERT INTO permission_definitions(code,title,module) VALUES
 ('low-code:page:list','查看低代码配置','低代码'),('low-code:page:create','创建低代码页面','低代码'),('low-code:page:update','编辑低代码草稿','低代码'),('low-code:page:publish','发布低代码页面','低代码'),('low-code:page:rollback','切换低代码发布与灰度','低代码'),('low-code:page:archive','归档低代码页面','低代码'),('low-code:page:run','运行授权低代码页面','低代码'),('low-code:source:list','查看低代码来源登记','低代码'),('low-code:source:create','登记低代码受控来源','低代码'),('low-code:source:update','启停低代码来源','低代码');
CREATE TABLE low_code_sources (
 tenant_id text NOT NULL,id text NOT NULL,code text NOT NULL,name text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('application-records','registered-dictionary')),
 application_release_id text,dictionary_source_id text,status text NOT NULL CHECK(status IN ('enabled','disabled')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,code),
 FOREIGN KEY(tenant_id,application_release_id) REFERENCES application_releases(tenant_id,id),
 FOREIGN KEY(tenant_id,dictionary_source_id) REFERENCES form_data_sources(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),
 CHECK((kind='application-records' AND application_release_id IS NOT NULL AND dictionary_source_id IS NULL) OR (kind='registered-dictionary' AND application_release_id IS NULL AND dictionary_source_id IS NOT NULL))
);
CREATE TABLE low_code_pages (
 tenant_id text NOT NULL,id text NOT NULL,name text NOT NULL,schema jsonb NOT NULL,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 status text NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','archived')),active_release_id text,rollout_release_id text,rollout_percent integer NOT NULL DEFAULT 0 CHECK(rollout_percent BETWEEN 0 AND 100),
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),
 CHECK(rollout_release_id IS NOT NULL OR rollout_percent=0),CHECK(rollout_release_id IS NULL OR rollout_release_id IS DISTINCT FROM active_release_id)
);
CREATE TABLE low_code_releases (
 tenant_id text NOT NULL,id text NOT NULL,page_id text NOT NULL,release_version integer NOT NULL CHECK(release_version>0),
 schema_snapshot jsonb NOT NULL,source_snapshots jsonb NOT NULL,content_hash text NOT NULL,published_by text NOT NULL,published_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,page_id,id),UNIQUE(tenant_id,page_id,release_version),
 FOREIGN KEY(tenant_id,page_id) REFERENCES low_code_pages(tenant_id,id),FOREIGN KEY(tenant_id,published_by) REFERENCES memberships(tenant_id,user_id)
);
ALTER TABLE low_code_pages ADD FOREIGN KEY(tenant_id,id,active_release_id) REFERENCES low_code_releases(tenant_id,page_id,id);
ALTER TABLE low_code_pages ADD FOREIGN KEY(tenant_id,id,rollout_release_id) REFERENCES low_code_releases(tenant_id,page_id,id);
CREATE TABLE low_code_release_sources (
 tenant_id text NOT NULL,release_id text NOT NULL,source_id text NOT NULL,
 PRIMARY KEY(tenant_id,release_id,source_id),FOREIGN KEY(tenant_id,release_id) REFERENCES low_code_releases(tenant_id,id),FOREIGN KEY(tenant_id,source_id) REFERENCES low_code_sources(tenant_id,id)
);
CREATE TRIGGER low_code_release_immutable BEFORE UPDATE OR DELETE ON low_code_releases FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE FUNCTION af_low_code_source_binding_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.code,NEW.kind,NEW.application_release_id,NEW.dictionary_source_id) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.code,OLD.kind,OLD.application_release_id,OLD.dictionary_source_id) THEN RAISE EXCEPTION 'Low code source binding is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER low_code_source_binding_immutable BEFORE UPDATE ON low_code_sources FOR EACH ROW EXECUTE FUNCTION af_low_code_source_binding_immutable();
CREATE INDEX low_code_pages_catalogue ON low_code_pages(tenant_id,status,updated_at,id);

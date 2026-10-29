-- Tenant-approved branding is separate from original private file access and membership preferences.
INSERT INTO permission_definitions(code,title,module) VALUES ('tenant:brand:manage','管理租户品牌','租户品牌');
CREATE FUNCTION af_tenant_brand_values_valid(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE(jsonb_typeof(value)='object' AND value->'version'='1'::jsonb
 AND (value-'version'-'brandName'-'title'-'logoFileId'-'primaryColor'-'appearance'-'compact'-'defaultLocale')='{}'::jsonb
 AND (SELECT count(*) FROM jsonb_object_keys(value))=8
 AND jsonb_typeof(value->'brandName')='string' AND char_length(value->>'brandName') BETWEEN 1 AND 64 AND btrim(value->>'brandName')<>''
 AND jsonb_typeof(value->'title')='string' AND char_length(value->>'title') BETWEEN 1 AND 100 AND btrim(value->>'title')<>''
 AND (value->>'brandName') !~ '[[:cntrl:]]' AND (value->>'title') !~ '[[:cntrl:]]'
 AND (value->>'brandName') !~ '<[[:space:]]*[/!?A-Za-z]' AND (value->>'title') !~ '<[[:space:]]*[/!?A-Za-z]'
 AND (value->'logoFileId'='null'::jsonb OR (jsonb_typeof(value->'logoFileId')='string' AND value->>'logoFileId' ~ '^[A-Za-z0-9_-]{1,100}$' AND value->>'logoFileId' NOT IN('__proto__','constructor','prototype')))
 AND jsonb_typeof(value->'primaryColor')='string' AND value->>'primaryColor' ~ '^#[A-F0-9]{6}$'
 AND value->>'appearance' IN('light','dark') AND jsonb_typeof(value->'compact')='boolean' AND value->>'defaultLocale' IN('zh-CN','en-US'),false)
$$;
CREATE TABLE tenant_brand_logo_bindings (
 tenant_id text NOT NULL,file_id text NOT NULL,object_key text NOT NULL CHECK(object_key ~ '^[a-f0-9]{64}$'),mime_type text NOT NULL CHECK(mime_type IN('image/png','image/jpeg')),
 size integer NOT NULL CHECK(size BETWEEN 1 AND 2097152),sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),width integer NOT NULL CHECK(width BETWEEN 1 AND 1024),height integer NOT NULL CHECK(height BETWEEN 1 AND 1024),
 bound_by text NOT NULL,bound_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,file_id),
 FOREIGN KEY(tenant_id,file_id) REFERENCES stored_files(tenant_id,id),FOREIGN KEY(tenant_id,bound_by) REFERENCES memberships(tenant_id,user_id)
);
CREATE TABLE tenant_brand_configurations (
 tenant_id text PRIMARY KEY REFERENCES tenants(id),revision integer NOT NULL CHECK(revision>0),draft_revision integer NOT NULL CHECK(draft_revision>0),
 draft jsonb NOT NULL CHECK(af_tenant_brand_values_valid(draft)),draft_logo_file_id text,active_version_id text,updated_by text NOT NULL,updated_name text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,draft_logo_file_id) REFERENCES tenant_brand_logo_bindings(tenant_id,file_id),FOREIGN KEY(tenant_id,updated_by) REFERENCES memberships(tenant_id,user_id),
 CHECK((draft->>'logoFileId') IS NOT DISTINCT FROM draft_logo_file_id)
);
CREATE TABLE tenant_brand_versions (
 tenant_id text NOT NULL,id text NOT NULL,version_number integer NOT NULL CHECK(version_number>0),source_draft_revision integer NOT NULL CHECK(source_draft_revision>0),
 snapshot jsonb NOT NULL CHECK(af_tenant_brand_values_valid(snapshot)),logo_file_id text,logo_binding jsonb,
 content_canonical text NOT NULL CHECK(octet_length(content_canonical)<=8192),content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 applied_by text NOT NULL,applied_name text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,version_number),
 UNIQUE(tenant_id,source_draft_revision),
 FOREIGN KEY(tenant_id) REFERENCES tenant_brand_configurations(tenant_id),FOREIGN KEY(tenant_id,logo_file_id) REFERENCES tenant_brand_logo_bindings(tenant_id,file_id),FOREIGN KEY(tenant_id,applied_by) REFERENCES memberships(tenant_id,user_id),
 CHECK((snapshot->>'logoFileId') IS NOT DISTINCT FROM logo_file_id),CHECK((logo_file_id IS NULL)=(logo_binding IS NULL)),
 CHECK(content_canonical::jsonb=jsonb_build_object('snapshot',snapshot,'logoBinding',logo_binding)),CHECK(encode(sha256(convert_to(content_canonical,'UTF8')),'hex')=content_hash)
);
ALTER TABLE tenant_brand_configurations ADD FOREIGN KEY(tenant_id,active_version_id) REFERENCES tenant_brand_versions(tenant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE membership_preferences (
 tenant_id text NOT NULL,user_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),locale text CHECK(locale IN('zh-CN','en-US')),appearance text CHECK(appearance IN('light','dark')),compact boolean,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id),FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id)
);
CREATE FUNCTION af_tenant_brand_binding_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM stored_files f WHERE f.tenant_id=NEW.tenant_id AND f.id=NEW.file_id AND f.owner_id=NEW.bound_by AND f.status='ready' AND f.scan_engine LIKE 'ClamAV %' AND f.scan_error IS NULL AND f.mime_type=NEW.mime_type AND f.object_key=NEW.object_key AND f.size=NEW.size AND f.sha256=NEW.sha256) THEN RAISE EXCEPTION 'Brand logo binding requires same-tenant clean immutable file identity' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tenant_brand_binding_guard BEFORE INSERT ON tenant_brand_logo_bindings FOR EACH ROW EXECUTE FUNCTION af_tenant_brand_binding_guard();
CREATE FUNCTION af_tenant_brand_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE expected jsonb; BEGIN
 IF NEW.logo_file_id IS NOT NULL THEN
  SELECT jsonb_build_object('fileId',b.file_id,'mimeType',b.mime_type,'size',b.size,'sha256',b.sha256,'width',b.width,'height',b.height) INTO expected FROM tenant_brand_logo_bindings b JOIN stored_files f ON f.tenant_id=b.tenant_id AND f.id=b.file_id WHERE b.tenant_id=NEW.tenant_id AND b.file_id=NEW.logo_file_id AND f.status='ready' AND f.scan_engine LIKE 'ClamAV %' AND f.scan_error IS NULL AND f.object_key=b.object_key AND f.sha256=b.sha256 AND f.size=b.size AND f.mime_type=b.mime_type;
  IF expected IS NULL OR expected IS DISTINCT FROM NEW.logo_binding THEN RAISE EXCEPTION 'Brand logo snapshot must match approved immutable binding' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM tenant_brand_configurations c WHERE c.tenant_id=NEW.tenant_id AND c.draft_revision=NEW.source_draft_revision AND c.draft=NEW.snapshot) THEN RAISE EXCEPTION 'Brand apply must capture the exact saved current draft' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tenant_brand_version_guard BEFORE INSERT ON tenant_brand_versions FOR EACH ROW EXECUTE FUNCTION af_tenant_brand_version_guard();
CREATE FUNCTION af_tenant_brand_file_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.object_key,NEW.mime_type,NEW.size,NEW.sha256) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.object_key,OLD.mime_type,OLD.size,OLD.sha256) AND EXISTS(SELECT 1 FROM tenant_brand_logo_bindings WHERE tenant_id=OLD.tenant_id AND file_id=OLD.id) THEN RAISE EXCEPTION 'Approved brand logo identity is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.status='deleted' AND OLD.status<>'deleted' AND (EXISTS(SELECT 1 FROM tenant_brand_configurations WHERE tenant_id=OLD.tenant_id AND draft_logo_file_id=OLD.id) OR EXISTS(SELECT 1 FROM tenant_brand_versions WHERE tenant_id=OLD.tenant_id AND logo_file_id=OLD.id)) THEN RAISE EXCEPTION 'Brand logo is referenced by draft or applied history' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tenant_brand_file_guard BEFORE UPDATE ON stored_files FOR EACH ROW EXECUTE FUNCTION af_tenant_brand_file_guard();
CREATE TRIGGER tenant_brand_binding_immutable BEFORE UPDATE OR DELETE ON tenant_brand_logo_bindings FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER tenant_brand_version_immutable BEFORE UPDATE OR DELETE ON tenant_brand_versions FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TRIGGER tenant_brand_config_no_delete BEFORE DELETE ON tenant_brand_configurations FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE INDEX tenant_brand_version_history ON tenant_brand_versions(tenant_id,version_number DESC);
CREATE INDEX tenant_brand_version_file ON tenant_brand_versions(tenant_id,logo_file_id) WHERE logo_file_id IS NOT NULL;

-- Current members may view their own preferences; brand administration remains an API permission.
INSERT INTO menu_route_catalogue(key,path,component_key,parent_key,locale,permissions,permission_mode,menu_type,default_order,protected) VALUES
('theme','/theme','DefaultLayout',NULL,'menu.theme','[]'::jsonb,'any','catalog',11,false),
('tenantBranding','/theme/branding','TenantBranding','theme','menu.theme.branding','[]'::jsonb,'any','menu',0,false);
INSERT INTO menu_resources(tenant_id,id,menu_name,menu_type,route_key,parent_id,sort)
 SELECT t.id,'default-theme',r.locale,r.menu_type,r.key,NULL,r.default_order
 FROM tenants t CROSS JOIN menu_route_catalogue r
 WHERE r.key='theme'
 AND NOT EXISTS(SELECT 1 FROM menu_resources m WHERE m.tenant_id=t.id AND m.route_key=r.key)
 ON CONFLICT DO NOTHING;
INSERT INTO menu_resources(tenant_id,id,menu_name,menu_type,route_key,parent_id,sort)
 SELECT t.id,'default-tenantBranding',r.locale,r.menu_type,r.key,parent.id,r.default_order
 FROM tenants t CROSS JOIN menu_route_catalogue r
 LEFT JOIN LATERAL (
   SELECT m.id FROM menu_resources m WHERE m.tenant_id=t.id AND m.route_key='theme'
   ORDER BY (m.deleted_at IS NULL) DESC,m.created_at,m.id LIMIT 1
 ) parent ON true
 WHERE r.key='tenantBranding'
 AND NOT EXISTS(SELECT 1 FROM menu_resources m WHERE m.tenant_id=t.id AND m.route_key=r.key)
 ON CONFLICT DO NOTHING;

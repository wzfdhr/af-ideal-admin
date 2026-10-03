CREATE TABLE application_package_page_sets (
 tenant_id text NOT NULL,id text NOT NULL,application_id text NOT NULL,package_hash text NOT NULL,
 pages jsonb NOT NULL,page_sources jsonb NOT NULL,dictionary_bindings jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','bound')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),reference_map jsonb NOT NULL DEFAULT '{}'::jsonb,
 application_release_id text,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),bound_at timestamptz,
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,application_id) REFERENCES applications(tenant_id,id),
 FOREIGN KEY(tenant_id,application_id,application_release_id) REFERENCES application_releases(tenant_id,application_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),
 CHECK((status='bound')=(application_release_id IS NOT NULL AND bound_at IS NOT NULL))
);
CREATE UNIQUE INDEX package_page_set_single_bind ON application_package_page_sets(tenant_id,application_id,package_hash);
CREATE TABLE application_package_page_bindings (
 tenant_id text NOT NULL,set_id text NOT NULL,page_key text NOT NULL,page_id text NOT NULL,
 PRIMARY KEY(tenant_id,set_id,page_key),FOREIGN KEY(tenant_id,set_id) REFERENCES application_package_page_sets(tenant_id,id),FOREIGN KEY(tenant_id,page_id) REFERENCES low_code_pages(tenant_id,id)
);
CREATE TRIGGER package_page_binding_immutable BEFORE UPDATE OR DELETE ON application_package_page_bindings FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE FUNCTION af_package_page_definition_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.application_id,NEW.package_hash,NEW.pages,NEW.page_sources,NEW.dictionary_bindings,NEW.created_by) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.application_id,OLD.package_hash,OLD.pages,OLD.page_sources,OLD.dictionary_bindings,OLD.created_by) THEN RAISE EXCEPTION 'Imported package page definitions are immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status='bound' THEN RAISE EXCEPTION 'Bound package page state is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER package_page_definition_immutable BEFORE UPDATE ON application_package_page_sets FOR EACH ROW EXECUTE FUNCTION af_package_page_definition_immutable();

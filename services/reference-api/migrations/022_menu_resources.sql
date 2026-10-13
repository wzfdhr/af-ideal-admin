CREATE TABLE menu_route_catalogue (
 key text PRIMARY KEY,path text NOT NULL,component_key text NOT NULL,parent_key text REFERENCES menu_route_catalogue(key),locale text NOT NULL,
 permissions jsonb NOT NULL CHECK(jsonb_typeof(permissions)='array'),permission_mode text NOT NULL CHECK(permission_mode IN('any','all')),menu_type text NOT NULL CHECK(menu_type IN('catalog','menu')),default_order integer NOT NULL,protected boolean NOT NULL
);
CREATE TABLE menu_resources (
 tenant_id text NOT NULL REFERENCES tenants(id),id text NOT NULL,menu_name text NOT NULL CHECK(length(menu_name) BETWEEN 1 AND 100),menu_type text NOT NULL CHECK(menu_type IN('catalog','menu','button')),
 route_key text REFERENCES menu_route_catalogue(key),parent_id text,permission text NOT NULL DEFAULT '',sort integer NOT NULL CHECK(sort BETWEEN 0 AND 100000),status text NOT NULL DEFAULT 'enabled' CHECK(status IN('enabled','disabled')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_by text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,parent_id) REFERENCES menu_resources(tenant_id,id),FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),
 CHECK(parent_id IS NULL OR parent_id<>id),CHECK((menu_type='button')=(permission<>'')),CHECK(menu_type<>'button' OR (route_key IS NULL AND parent_id IS NOT NULL)),CHECK(menu_type<>'menu' OR route_key IS NOT NULL)
);
CREATE INDEX menu_route_identity ON menu_resources(tenant_id,route_key);
CREATE UNIQUE INDEX menu_button_identity ON menu_resources(tenant_id,parent_id,permission) WHERE menu_type='button';
CREATE FUNCTION af_menu_binding_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.menu_type,NEW.route_key,NEW.permission,NEW.created_by) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.menu_type,OLD.route_key,OLD.permission,OLD.created_by) THEN RAISE EXCEPTION 'Menu binding is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER menu_binding_immutable BEFORE UPDATE ON menu_resources FOR EACH ROW EXECUTE FUNCTION af_menu_binding_immutable();
INSERT INTO menu_route_catalogue(key,path,component_key,parent_key,locale,permissions,permission_mode,menu_type,default_order,protected) VALUES
('dashboard','/dashboard','DefaultLayout',NULL,'menu.dashboard','[]'::jsonb,'any','catalog',0,true),
('workplace','/dashboard/workplace','DashboardWorkplace','dashboard','menu.dashboard.workplace','[]'::jsonb,'any','menu',0,true),
('leave','/leave','DefaultLayout',NULL,'menu.leave','[]'::jsonb,'any','catalog',1,false),
('leaveRequests','/leave/requests','LeaveRequests','leave','menu.leave.requests','["leave:read:self"]'::jsonb,'any','menu',0,false),
('leaveApplication','/leave/application','LeaveApplication','leave','menu.leave.application','["application:configure"]'::jsonb,'any','menu',0,false),
('message','/message','DefaultLayout',NULL,'menu.message','[]'::jsonb,'any','catalog',7,false),
('messageCenter','/message/center','MessageCenter','message','menu.message.center','["message:list"]'::jsonb,'any','menu',0,false),
('Scalability','/Scalability','FullPageLayout',NULL,'menu.Scalability','[]'::jsonb,'any','catalog',5,false),
('workflowCenter','/Scalability/workflowCenter','WorkflowCenter','Scalability','menu.Scalability.workflowCenter','["workflow:todo","workflow:recover","workflow:timer:read"]'::jsonb,'any','menu',0,false),
('lowCodeBuilder','/Scalability/lowCodeBuilder','LowCodeBuilderPage','Scalability','menu.Scalability.lowCodeBuilder','["low-code:page:list"]'::jsonb,'any','menu',0,false),
('lowCode','/low-code','DefaultLayout',NULL,'menu.lowCode','[]'::jsonb,'any','catalog',6,false),
('lowCodeRuntimePages','/low-code/pages','LowCodeRuntimePage','lowCode','menu.lowCode.runtime','["low-code:page:run"]'::jsonb,'any','menu',0,false),
('audit','/audit','DefaultLayout',NULL,'menu.audit','[]'::jsonb,'any','catalog',8,false),
('auditLogs','/audit/logs','AuditLogs','audit','menu.audit.logs','["audit:read"]'::jsonb,'any','menu',0,false),
('system','/system','DefaultLayout',NULL,'menu.system','[]'::jsonb,'any','catalog',6,true),
('departmentSystem','/system/departmentSystem','SystemDepartmentPage','system','menu.system.department','["system:department:list"]'::jsonb,'any','menu',0,false),
('positionSystem','/system/positionSystem','SystemPositionPage','system','menu.system.position','["system:position:list","system:organization:assign"]'::jsonb,'any','menu',0,false),
('menuSystem','/system/menuSystem','SystemMenuPage','system','menu.system.menu','["system:menu:list"]'::jsonb,'any','menu',0,true),
('dictSystem','/system/dictSystem','SystemDictPage','system','menu.system.dict','["system:dict:list"]'::jsonb,'any','menu',0,false),
('userSystem','/system/userSystem','SystemUserPage','system','menu.system.user','["system:user:list"]'::jsonb,'any','menu',0,false),
('roleSystem','/system/roleSystem','SystemRolePage','system','menu.system.role','["system:role:list"]'::jsonb,'any','menu',0,false),
('user','/user','DefaultLayout',NULL,'menu.user','[]'::jsonb,'any','catalog',2,true),
('accountPassword','/user/password','AccountPassword','user','menu.user.password','["account:password:update"]'::jsonb,'any','menu',0,true),
('permissions','/permissions','DefaultLayout',NULL,'menu.permissions','[]'::jsonb,'any','catalog',4,false),
('backend','/permissions/backend','RouteGroupLayout','permissions','menu.permissions.backend','[]'::jsonb,'any','catalog',0,false),
('dataPermissionCenter','/permissions/backend/data-scope','DataPermissionCenter','backend','menu.permissions.backend.dataScope','["data-permission:view"]'::jsonb,'any','menu',0,false),
('applications','/applications','DefaultLayout',NULL,'menu.applications','[]'::jsonb,'any','catalog',2,false),
('applicationCenter','/applications/center','ApplicationCenter','applications','menu.applications.center','["application:list"]'::jsonb,'any','menu',0,false),
('businessRecords','/business','DefaultLayout',NULL,'menu.business.records','[]'::jsonb,'any','catalog',3,false),
('businessRecordsList','/business/records','BusinessRecords','businessRecords','menu.business.records','["business:read:self"]'::jsonb,'any','menu',0,false),
('resource','/resource','DefaultLayout',NULL,'menu.resource','[]'::jsonb,'any','catalog',10,false),
('fileResourceCenter','/resource/files','FileResourceCenter','resource','menu.resource.files','["file:list"]'::jsonb,'any','menu',0,false);
CREATE TRIGGER menu_route_catalogue_immutable BEFORE UPDATE OR DELETE ON menu_route_catalogue FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
INSERT INTO menu_resources(tenant_id,id,menu_name,menu_type,route_key,parent_id,sort) SELECT t.id,'default-'||r.key,r.locale,r.menu_type,r.key,CASE WHEN r.parent_key IS NULL THEN NULL ELSE 'default-'||r.parent_key END,r.default_order FROM tenants t CROSS JOIN menu_route_catalogue r;
INSERT INTO permission_definitions(code,title,module) VALUES ('system:menu:list','查看菜单资源','菜单资源'),('system:menu:detail','查看菜单资源详情','菜单资源'),('system:menu:create','创建菜单资源','菜单资源'),('system:menu:update','维护菜单资源','菜单资源'),('system:menu:delete','删除菜单资源','菜单资源');
CREATE FUNCTION af_menu_governance_protected() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.status='disabled' OR NEW.deleted_at IS NOT NULL OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) AND EXISTS (
  WITH RECURSIVE descendants(id,route_key) AS (SELECT OLD.id,OLD.route_key UNION SELECT m.id,m.route_key FROM menu_resources m JOIN descendants d ON m.parent_id=d.id WHERE m.tenant_id=OLD.tenant_id AND m.deleted_at IS NULL)
  SELECT 1 FROM descendants d JOIN menu_route_catalogue c ON c.key=d.route_key WHERE c.protected
 ) THEN RAISE EXCEPTION 'Governance entry is protected' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER menu_governance_protected BEFORE UPDATE ON menu_resources FOR EACH ROW EXECUTE FUNCTION af_menu_governance_protected();
CREATE FUNCTION af_menu_graph_valid() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE parent_type text; BEGIN
 IF NEW.parent_id IS NOT NULL THEN
  SELECT menu_type INTO parent_type FROM menu_resources WHERE tenant_id=NEW.tenant_id AND id=NEW.parent_id;
  IF (NEW.menu_type='button' AND parent_type<>'menu') OR (NEW.menu_type<>'button' AND parent_type<>'catalog') THEN RAISE EXCEPTION 'Invalid parent type' USING ERRCODE='23514'; END IF;
  IF EXISTS(WITH RECURSIVE ancestors(id,parent_id) AS (SELECT id,parent_id FROM menu_resources WHERE tenant_id=NEW.tenant_id AND id=NEW.parent_id UNION SELECT m.id,m.parent_id FROM menu_resources m JOIN ancestors a ON m.id=a.parent_id WHERE m.tenant_id=NEW.tenant_id) SELECT 1 FROM ancestors WHERE id=NEW.id) THEN RAISE EXCEPTION 'Menu cycle' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.route_key IS NOT NULL AND NOT EXISTS(SELECT 1 FROM menu_route_catalogue WHERE key=NEW.route_key AND menu_type=NEW.menu_type) THEN RAISE EXCEPTION 'Route type mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER menu_graph_valid BEFORE INSERT OR UPDATE ON menu_resources FOR EACH ROW EXECUTE FUNCTION af_menu_graph_valid();
CREATE TRIGGER menu_no_physical_delete BEFORE DELETE ON menu_resources FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();

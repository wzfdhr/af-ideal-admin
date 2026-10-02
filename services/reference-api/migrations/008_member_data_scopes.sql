INSERT INTO permission_definitions(code,title,module) VALUES
 ('data-permission:view','查看数据范围配置','数据权限'),('data-permission:update','配置数据范围','数据权限'),('data-permission:preview','预览授权成员','数据权限');
CREATE TABLE role_member_scopes (
 tenant_id text NOT NULL,role_id text NOT NULL,
 data_scope text NOT NULL DEFAULT 'self' CHECK(data_scope IN ('all','tenant','department','department-and-children','self')),
 field_permissions jsonb NOT NULL DEFAULT '["username","name","dept","status"]'::jsonb CHECK(jsonb_typeof(field_permissions)='array'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,role_id),FOREIGN KEY(tenant_id,role_id) REFERENCES roles(tenant_id,id)
);
CREATE TABLE role_scope_departments (
 tenant_id text NOT NULL,role_id text NOT NULL,department_id text NOT NULL,
 PRIMARY KEY(tenant_id,role_id,department_id),
 FOREIGN KEY(tenant_id,role_id) REFERENCES role_member_scopes(tenant_id,role_id),
 FOREIGN KEY(tenant_id,department_id) REFERENCES departments(tenant_id,id)
);
-- Existing role semantics remain tenant-wide until explicitly reconfigured.
INSERT INTO role_member_scopes(tenant_id,role_id,data_scope,field_permissions)
 SELECT tenant_id,id,'all','["username","name","dept","status","phone","email"]'::jsonb FROM roles;
CREATE FUNCTION af_member_scope_visible(subject_tenant text,subject_user text,required_code text,target_user text,selected_role text DEFAULT NULL) RETURNS boolean LANGUAGE SQL STABLE AS $$
 WITH RECURSIVE subject AS (
  SELECT * FROM memberships WHERE tenant_id=subject_tenant AND user_id=subject_user AND status='enabled' AND deleted_at IS NULL
 ), target AS (
  SELECT * FROM memberships WHERE tenant_id=subject_tenant AND user_id=target_user AND deleted_at IS NULL
 ), permitted_roles AS (
  SELECT r.id,COALESCE(s.data_scope,'self') AS data_scope FROM subject m
  JOIN member_roles mr ON mr.tenant_id=m.tenant_id AND mr.user_id=m.user_id
  JOIN roles r ON r.tenant_id=mr.tenant_id AND r.id=mr.role_id
  JOIN role_permissions rp ON rp.tenant_id=r.tenant_id AND rp.role_id=r.id AND rp.permission_code=required_code
  JOIN permission_definitions p ON p.code=rp.permission_code AND p.status='enabled'
  LEFT JOIN role_member_scopes s ON s.tenant_id=r.tenant_id AND s.role_id=r.id
  WHERE r.status='enabled' AND r.deleted_at IS NULL AND (selected_role IS NULL OR r.id=selected_role)
 ), roots AS (
  SELECT pr.id AS role_id,pr.data_scope,sd.department_id FROM permitted_roles pr JOIN role_scope_departments sd ON sd.tenant_id=subject_tenant AND sd.role_id=pr.id
  UNION
  SELECT pr.id,pr.data_scope,m.department_id FROM permitted_roles pr CROSS JOIN subject m WHERE m.department_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM role_scope_departments sd WHERE sd.tenant_id=subject_tenant AND sd.role_id=pr.id)
 ), allowed_departments AS (
  SELECT role_id,data_scope,department_id FROM roots
  UNION
  SELECT a.role_id,a.data_scope,d.id FROM allowed_departments a JOIN departments d ON d.tenant_id=subject_tenant AND d.parent_id=a.department_id AND d.deleted_at IS NULL WHERE a.data_scope='department-and-children'
 )
 SELECT EXISTS(SELECT 1 FROM subject m CROSS JOIN target t WHERE
  (selected_role IS NULL AND (m.permissions ? required_code OR m.permissions ? '*')) OR EXISTS (
   SELECT 1 FROM permitted_roles pr WHERE pr.data_scope IN ('all','tenant') OR (pr.data_scope='self' AND t.user_id=m.user_id) OR
   (pr.data_scope IN ('department','department-and-children') AND EXISTS(SELECT 1 FROM allowed_departments a WHERE a.role_id=pr.id AND a.department_id=t.department_id))
  ))
$$;
CREATE FUNCTION af_member_field_visible(subject_tenant text,subject_user text,required_code text,target_user text,field_code text) RETURNS boolean LANGUAGE SQL STABLE AS $$
 SELECT EXISTS (
  SELECT 1 FROM memberships m WHERE m.tenant_id=subject_tenant AND m.user_id=subject_user AND m.status='enabled' AND m.deleted_at IS NULL AND (m.permissions ? required_code OR m.permissions ? '*')
 ) OR EXISTS (
  SELECT 1 FROM member_roles mr JOIN roles r ON r.tenant_id=mr.tenant_id AND r.id=mr.role_id
  JOIN role_permissions rp ON rp.tenant_id=r.tenant_id AND rp.role_id=r.id AND rp.permission_code=required_code
  JOIN permission_definitions p ON p.code=rp.permission_code AND p.status='enabled'
  JOIN role_member_scopes s ON s.tenant_id=r.tenant_id AND s.role_id=r.id AND s.field_permissions ? field_code
  WHERE mr.tenant_id=subject_tenant AND mr.user_id=subject_user AND r.status='enabled' AND r.deleted_at IS NULL
  AND af_member_scope_visible(subject_tenant,subject_user,required_code,target_user,r.id)
 )
$$;

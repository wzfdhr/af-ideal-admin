CREATE TABLE permission_definitions (
 code text PRIMARY KEY CHECK(code ~ '^[a-z][a-z0-9:-]{1,119}$'),
 title text NOT NULL,
 module text NOT NULL,
 status text NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','disabled'))
);
INSERT INTO permission_definitions(code,title,module) VALUES
 ('leave:read:self','查看本人申请','请假'),('leave:create','创建本人申请','请假'),('leave:update:self','编辑本人草稿','请假'),('leave:submit','提交本人申请','请假'),('leave:withdraw:self','撤回本人申请','请假'),
 ('workflow:todo','查看分配的待办','审批'),('workflow:approve','处理分配的审批','审批'),('workflow:reject','拒绝分配的审批','审批'),
 ('application:configure','配置业务应用','应用'),('application:publish','发布业务应用','应用'),('application:rollback','回退业务应用','应用'),('audit:read','检索事实审计','审计'),
 ('system:department:list','查看部门目录','组织'),('system:department:detail','查看部门详情','组织'),('system:department:create','新增部门','组织'),('system:department:update','编辑部门','组织'),('system:department:delete','删除部门','组织'),
 ('system:position:list','查看岗位目录','组织'),('system:position:create','新增岗位','组织'),('system:position:update','编辑岗位','组织'),('system:position:delete','删除岗位','组织'),('system:organization:assign','绑定成员组织','组织'),
 ('system:user:list','查看租户成员','用户'),('system:user:detail','查看成员详情','用户'),('system:user:create','新增私有身份','用户'),('system:user:update','维护成员资料','用户'),('system:user:delete','撤销成员关系','用户'),('system:user:reset-password','重置受控私有凭据','用户'),('system:user:read-contacts','查看联系资料原值','用户'),
 ('system:role:list','查看角色目录','授权'),('system:role:detail','查看角色详情','授权'),('system:role:create','新增角色','授权'),('system:role:update','编辑角色','授权'),('system:role:delete','删除角色','授权'),('system:role:permissions','绑定角色权限','授权'),('system:role:assign','管理成员授权','授权'),
 ('message:list','查看本人站内消息','本人基础能力'),('message:read','标记本人消息','本人基础能力'),('message:batch-read','标记本人全部消息','本人基础能力'),('account:password:update','修改本人密码','本人基础能力');
CREATE TABLE roles (
 tenant_id text NOT NULL REFERENCES tenants(id), id text NOT NULL,
 role_name text NOT NULL, role_key text NOT NULL, role_sort integer NOT NULL DEFAULT 0 CHECK(role_sort BETWEEN 0 AND 100000),
 status text NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','disabled')),
 remark text NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 PRIMARY KEY(tenant_id,id)
);
CREATE UNIQUE INDEX role_live_key ON roles(tenant_id,role_key) WHERE deleted_at IS NULL;
CREATE TABLE role_permissions (
 tenant_id text NOT NULL,role_id text NOT NULL,permission_code text NOT NULL REFERENCES permission_definitions(code),
 PRIMARY KEY(tenant_id,role_id,permission_code),FOREIGN KEY(tenant_id,role_id) REFERENCES roles(tenant_id,id)
);
CREATE TABLE member_roles (
 tenant_id text NOT NULL,user_id text NOT NULL,role_id text NOT NULL,
 PRIMARY KEY(tenant_id,user_id,role_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id),FOREIGN KEY(tenant_id,role_id) REFERENCES roles(tenant_id,id)
);
CREATE INDEX role_members ON member_roles(tenant_id,role_id,user_id);
CREATE FUNCTION af_effective_permissions(subject_tenant text,subject_user text) RETURNS jsonb LANGUAGE SQL STABLE AS $$
 SELECT COALESCE(jsonb_agg(code ORDER BY code),'[]'::jsonb) FROM (
  SELECT DISTINCT code FROM (
   SELECT jsonb_array_elements_text(m.permissions) AS code FROM memberships m WHERE m.tenant_id=subject_tenant AND m.user_id=subject_user
   UNION ALL
   SELECT rp.permission_code FROM member_roles mr JOIN roles r ON r.tenant_id=mr.tenant_id AND r.id=mr.role_id JOIN role_permissions rp ON rp.tenant_id=r.tenant_id AND rp.role_id=r.id JOIN permission_definitions p ON p.code=rp.permission_code
   WHERE mr.tenant_id=subject_tenant AND mr.user_id=subject_user AND r.status='enabled' AND r.deleted_at IS NULL AND p.status='enabled'
  ) capabilities
 ) effective
$$;

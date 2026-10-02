export interface PermissionDefinition {
  code: string
  title: string
  module: string
}
export const PLATFORM_PERMISSION_CATALOGUE: PermissionDefinition[] = [
  {
    code: 'leave:read:self',
    title: '查看本人申请',
    module: '请假',
  },
  {
    code: 'leave:create',
    title: '创建本人申请',
    module: '请假',
  },
  {
    code: 'leave:update:self',
    title: '编辑本人草稿',
    module: '请假',
  },
  {
    code: 'leave:submit',
    title: '提交本人申请',
    module: '请假',
  },
  {
    code: 'leave:withdraw:self',
    title: '撤回本人申请',
    module: '请假',
  },
  {
    code: 'workflow:todo',
    title: '查看分配的待办',
    module: '审批',
  },
  {
    code: 'workflow:approve',
    title: '处理分配的审批',
    module: '审批',
  },
  {
    code: 'workflow:reject',
    title: '拒绝分配的审批',
    module: '审批',
  },
  {
    code: 'application:configure',
    title: '配置业务应用',
    module: '应用',
  },
  {
    code: 'application:publish',
    title: '发布业务应用',
    module: '应用',
  },
  {
    code: 'application:rollback',
    title: '回退业务应用',
    module: '应用',
  },
  {
    code: 'audit:read',
    title: '检索事实审计',
    module: '审计',
  },
  {
    code: 'system:department:list',
    title: '查看部门目录',
    module: '组织',
  },
  {
    code: 'system:department:detail',
    title: '查看部门详情',
    module: '组织',
  },
  {
    code: 'system:department:create',
    title: '新增部门',
    module: '组织',
  },
  {
    code: 'system:department:update',
    title: '编辑部门',
    module: '组织',
  },
  {
    code: 'system:department:delete',
    title: '删除部门',
    module: '组织',
  },
  {
    code: 'system:position:list',
    title: '查看岗位目录',
    module: '组织',
  },
  {
    code: 'system:position:create',
    title: '新增岗位',
    module: '组织',
  },
  {
    code: 'system:position:update',
    title: '编辑岗位',
    module: '组织',
  },
  {
    code: 'system:position:delete',
    title: '删除岗位',
    module: '组织',
  },
  {
    code: 'system:organization:assign',
    title: '绑定成员组织',
    module: '组织',
  },
  {
    code: 'system:user:list',
    title: '查看租户成员',
    module: '用户',
  },
  {
    code: 'system:user:detail',
    title: '查看成员详情',
    module: '用户',
  },
  {
    code: 'system:user:create',
    title: '新增私有身份',
    module: '用户',
  },
  {
    code: 'system:user:update',
    title: '维护成员资料',
    module: '用户',
  },
  {
    code: 'system:user:delete',
    title: '撤销成员关系',
    module: '用户',
  },
  {
    code: 'system:user:reset-password',
    title: '重置受控私有凭据',
    module: '用户',
  },
  {
    code: 'system:user:read-contacts',
    title: '查看联系资料原值',
    module: '用户',
  },
  {
    code: 'system:role:list',
    title: '查看角色目录',
    module: '授权',
  },
  {
    code: 'system:role:detail',
    title: '查看角色详情',
    module: '授权',
  },
  {
    code: 'system:role:create',
    title: '新增角色',
    module: '授权',
  },
  {
    code: 'system:role:update',
    title: '编辑角色',
    module: '授权',
  },
  {
    code: 'system:role:delete',
    title: '删除角色',
    module: '授权',
  },
  {
    code: 'system:role:permissions',
    title: '绑定角色权限',
    module: '授权',
  },
  {
    code: 'system:role:assign',
    title: '管理成员授权',
    module: '授权',
  },
  {
    code: 'message:list',
    title: '查看本人站内消息',
    module: '本人基础能力',
  },
  {
    code: 'message:read',
    title: '标记本人消息',
    module: '本人基础能力',
  },
  {
    code: 'message:batch-read',
    title: '标记本人全部消息',
    module: '本人基础能力',
  },
  {
    code: 'account:password:update',
    title: '修改本人密码',
    module: '本人基础能力',
  },
]

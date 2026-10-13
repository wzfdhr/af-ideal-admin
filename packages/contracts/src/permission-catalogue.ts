import { MESSAGING_PERMISSIONS } from './messaging'
import { REPORTING_PERMISSIONS } from './reporting'

export interface PermissionDefinition {
  code: string
  title: string
  module: string
}
export const PLATFORM_PERMISSION_CATALOGUE: PermissionDefinition[] = [
  ...Object.entries(REPORTING_PERMISSIONS).map(([key, code]) => ({
    code,
    title: (
      {
        list: '查看报表配置',
        create: '创建报表',
        update: '编辑报表草稿',
        publish: '发布报表快照',
        disable: '启停报表',
        query: '查询授权报表',
        fieldApplicant: '读取报表申请人字段',
        fieldBusiness: '读取报表业务字段',
      } as Record<string, string>
    )[key],
    module: '真实报表',
  })),
  ...Object.entries(MESSAGING_PERMISSIONS).map(([key, code]) => ({
    code,
    title: (
      {
        templateList: '查看消息模板',
        templateCreate: '创建消息模板',
        templateUpdate: '编辑模板草稿',
        templateSubmit: '提交模板审批',
        templateApprove: '审批消息模板',
        templateDisable: '启停消息模板',
        templateDelete: '归档消息模板',
        announcementList: '查看公告配置',
        announcementCreate: '创建公告',
        announcementUpdate: '编辑公告草稿',
        announcementPublish: '发布公告',
        announcementRevoke: '撤销公告',
        announcementRead: '阅读授权公告',
        subscriptionRead: '查看本人订阅',
        subscriptionUpdate: '保存本人订阅',
        sendList: '查看消息发送事实',
        sendCreate: '创建消息发送计划',
        sendCancel: '取消待投递消息',
        sendRetry: '重试失败投递',
      } as Record<string, string>
    )[key],
    module: '消息公告',
  })),
  ...[
    ['list', '查看菜单资源'],
    ['detail', '查看菜单资源详情'],
    ['create', '创建菜单资源'],
    ['update', '维护菜单资源'],
    ['delete', '删除菜单资源'],
  ].map(([action, title]) => ({
    code: `system:menu:${action}`,
    title,
    module: '菜单资源',
  })),
  ...[
    ['list', '查看数据源登记'],
    ['create', '登记受控数据源'],
    ['update', '维护与启停数据源'],
    ['read', '查询授权数据源'],
  ].map(([action, title]) => ({
    code: `form-source:${action}`,
    title,
    module: '表单数据源',
  })),
  ...[
    ['list', '查看字典列表'],
    ['detail', '查看字典详情及选项'],
    ['create', '创建字典'],
    ['update', '更新字典和选项'],
    ['delete', '删除字典'],
    ['read', '读取运行字典选项'],
  ].map(([action, title]) => ({
    code: `system:dict:${action}`,
    title,
    module: '字典',
  })),
  { code: 'low-code:page:list', title: '查看低代码配置', module: '低代码' },
  { code: 'low-code:page:create', title: '创建低代码页面', module: '低代码' },
  { code: 'low-code:page:update', title: '编辑低代码草稿', module: '低代码' },
  { code: 'low-code:page:publish', title: '发布低代码页面', module: '低代码' },
  {
    code: 'low-code:page:rollback',
    title: '切换低代码发布与灰度',
    module: '低代码',
  },
  { code: 'low-code:page:archive', title: '归档低代码页面', module: '低代码' },
  { code: 'low-code:page:run', title: '运行授权低代码页面', module: '低代码' },
  {
    code: 'low-code:source:list',
    title: '查看低代码来源登记',
    module: '低代码',
  },
  {
    code: 'low-code:source:create',
    title: '登记低代码受控来源',
    module: '低代码',
  },
  { code: 'low-code:source:update', title: '启停低代码来源', module: '低代码' },
  { code: 'application:export', title: '导出脱敏应用定义包', module: '应用' },
  { code: 'application:import', title: '校验并导入应用定义包', module: '应用' },
  { code: 'file:list', title: '查看授权文件和附件', module: '文件' },
  { code: 'file:upload', title: '上传真实文件', module: '文件' },
  { code: 'file:download', title: '下载授权文件', module: '文件' },
  { code: 'file:preview', title: '预览授权文件', module: '文件' },
  { code: 'file:delete', title: '删除本人未锁定附件', module: '文件' },
  {
    code: 'business:read:self',
    title: '查看本人和参与的业务记录',
    module: '业务运行',
  },
  { code: 'business:create', title: '创建本人业务记录', module: '业务运行' },
  {
    code: 'business:update:self',
    title: '编辑本人业务草稿',
    module: '业务运行',
  },
  { code: 'business:submit', title: '提交本人业务记录', module: '业务运行' },
  {
    code: 'business:withdraw:self',
    title: '撤回本人业务记录',
    module: '业务运行',
  },
  { code: 'application:list', title: '查看应用中心', module: '应用' },
  { code: 'application:create', title: '创建应用', module: '应用' },
  { code: 'application:copy', title: '独立复制应用', module: '应用' },
  { code: 'application:archive', title: '归档和恢复应用', module: '应用' },
  {
    code: 'data-permission:view',
    title: '查看数据范围配置',
    module: '数据权限',
  },
  { code: 'data-permission:update', title: '配置数据范围', module: '数据权限' },
  {
    code: 'data-permission:preview',
    title: '预览授权成员',
    module: '数据权限',
  },
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
    code: 'workflow:timer:read',
    title: '查询授权范围内流程定时',
    module: '审批',
  },
  {
    code: 'workflow:timer:retry',
    title: '恢复授权范围内流程定时',
    module: '审批',
  },
  { code: 'workflow:transfer', title: '转交本人待办', module: '审批' },
  { code: 'workflow:recover', title: '恢复授权范围内异常审批', module: '审批' },
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

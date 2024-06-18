/**
 * 本文件包含项目中所使用的各项公共配置
 */
import { FileEditFill, MailFill, ClipboardFill } from '@salmon-ui/icons'

// 用户角色权限组，其中 * 表示通配符
export type UserRole = '' | '*' | 'admin' | 'user'

// HTTP 响应的类型断言
export interface HTTPResponse<T = unknown> {
  data: T
  status: number
  msg: string
  code: number
}

// HTTP 请求的公共路径前缀
export const requestBaseUrl = import.meta.env.BASE_URL || ''

// 应用是否应当从服务端获取侧边菜单栏
export const menuFromServer = false

// 用户没有权限访问某一页面时，是否显示“无权限”提示页
// 如果设置为 false，则系统在用户没有权限访问某一页面时自动转到该用户可以访问的第一个页面；
// 如果设置为 true，则展示系统内置的“无权限”提示页面。
export const toNoPermissionPage = true

// 侧边菜单栏的宽度
export const menuWidth = 240

// 系统通知的类别、对应的颜色及图标配置
// 用于在顶部导航栏显示通知的图标样式
export const noticeTypeMap = [
  {
    type: 'report',
    icon: FileEditFill,
    bg: '#f43f5e',
  },
  {
    type: 'normal',
    icon: MailFill,
    bg: '#3b82f6',
  },
  {
    type: 'audit',
    icon: ClipboardFill,
    bg: '#f59e0b',
  },
]

// 需要缓存的路由的名称
// 被缓存的路由在第一次访问时执行事件钩子 hooks，重复访问时不再更新状态
// 仅应该用于开销大、没有实时性要求的页面
export const namesRouteCached: string[] = []

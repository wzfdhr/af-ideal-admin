export const MESSAGE_PERMISSIONS = {
  list: 'message:list',
  read: 'message:read',
  batchRead: 'message:batch-read',
  subscribe: 'message:subscribe',
  push: 'message:push',
  template: 'message:template',
  send: 'message:send',
} as const

export default MESSAGE_PERMISSIONS

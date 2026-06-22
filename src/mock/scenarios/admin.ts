import { mockMenus, mockUsers } from '../seed'

const adminScenario = {
  name: 'admin',
  user: mockUsers.find((item) => item.role === 'admin'),
  menus: mockMenus.admin,
}

export default adminScenario

import { mockMenus, mockUsers } from '../seed'

const operatorScenario = {
  name: 'operator',
  user: mockUsers.find((item) => item.role === 'operator'),
  menus: mockMenus.operator,
}

export default operatorScenario

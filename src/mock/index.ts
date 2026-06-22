import Mock from 'mockjs'
import setupAuthMock from './modules/auth'
import setupBusinessMock from './modules/business'
import setupDictionaryMock from './modules/dictionary'
import setupMenuMock from './modules/menu'
import setupPermissionMock from './modules/permission'
import setupSystemDictionaryMock from './modules/system-dictionary'
import setupSystemMenuMock from './modules/system-menu'
import setupSystemRoleMock from './modules/system-role'
import setupSystemUserMock from './modules/system-user'

Mock.setup({
  timeout: '600-1200',
})

setupAuthMock()
setupMenuMock()
setupPermissionMock()
setupDictionaryMock()
setupSystemDictionaryMock()
setupSystemMenuMock()
setupSystemRoleMock()
setupSystemUserMock()
setupBusinessMock()

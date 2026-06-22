import Mock from 'mockjs'
import setupAuthMock from './modules/auth'
import setupBusinessMock from './modules/business'
import setupDictionaryMock from './modules/dictionary'
import setupMenuMock from './modules/menu'
import setupPermissionMock from './modules/permission'

Mock.setup({
  timeout: '600-1200',
})

setupAuthMock()
setupMenuMock()
setupPermissionMock()
setupDictionaryMock()
setupBusinessMock()

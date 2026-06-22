import Mock from 'mockjs'
import setupAuthMock from './modules/auth'
import setupBusinessMock from './modules/business'
import setupDataScreenMock from './modules/data-screen'
import setupDictionaryMock from './modules/dictionary'
import setupFormDesignerMock from './modules/form-designer'
import setupLowCodeMock from './modules/low-code'
import setupMenuMock from './modules/menu'
import setupPermissionMock from './modules/permission'
import setupSystemDepartmentMock from './modules/system-department'
import setupSystemDictionaryMock from './modules/system-dictionary'
import setupSystemMenuMock from './modules/system-menu'
import setupSystemRoleMock from './modules/system-role'
import setupSystemUserMock from './modules/system-user'
import setupWorkflowMock from './modules/workflow'

Mock.setup({
  timeout: '600-1200',
})

setupAuthMock()
setupMenuMock()
setupPermissionMock()
setupDictionaryMock()
setupFormDesignerMock()
setupDataScreenMock()
setupLowCodeMock()
setupWorkflowMock()
setupSystemDepartmentMock()
setupSystemDictionaryMock()
setupSystemMenuMock()
setupSystemRoleMock()
setupSystemUserMock()
setupBusinessMock()

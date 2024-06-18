import type { RouteRecordNormalized } from 'vue-router'

const modules = import.meta.glob('./modules/*.ts', {
  eager: true,
})
const externalModules = import.meta.glob('./external-modules/*.ts', {
  eager: true,
})
const subModules = import.meta.glob('./sub-modules/*.ts', {
  eager: true,
})

const formatRoutes = (_modules: any, result: RouteRecordNormalized[]) => {
  Object.keys(_modules).forEach((key) => {
    const defaultExport = _modules[key].default

    if (defaultExport) {
      const moduleList = Array.isArray(defaultExport)
        ? [...defaultExport]
        : [defaultExport]

      result.push(...moduleList)
    }
  })

  return result
}

export const appRoutes = formatRoutes(modules, [])
export const externalRoutes = formatRoutes(externalModules, [])
export const subModuleRoutes = formatRoutes(subModules, [])

export const defaultRouteName = 'workplace'

export const defaultRoute = {
  title: '工作台',
  name: defaultRouteName,
  fullPath: '/dashboard/workplace',
}

export default defaultRouteName

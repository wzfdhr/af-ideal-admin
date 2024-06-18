import { appRoutes, externalRoutes, subModuleRoutes } from '../routes'

const mixinRoutes = [...appRoutes, ...externalRoutes, ...subModuleRoutes]

const appClientMenus = mixinRoutes.map((el) => {
  const { name, path, meta, redirect, children } = el
  return {
    name,
    path,
    meta,
    redirect,
    children,
  }
})

export default appClientMenus

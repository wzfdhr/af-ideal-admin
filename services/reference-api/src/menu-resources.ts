import { randomUUID } from 'node:crypto'
import {
  DomainError,
  MENU_PERMISSIONS as P,
  MENU_ROUTE_CATALOGUE,
  MENU_ROUTE_ALIASES,
  parseMenuResource,
  record,
  onlyKeys,
  text,
  positiveInteger,
} from '@af-admin/contracts'
import {
  hasPermission,
  requirePermission,
  assertRevision,
} from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  rows,
  one,
  audit,
  pageQuery,
  authorizedTransaction,
  idempotent,
} from './support'
import type {
  MenuResourceInput,
  MenuResourceRecord,
  CapabilityMenuNode,
} from '@af-admin/contracts'
import type { Database, FaultInjector } from './support'
import type { Actor } from './auth'
import type { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'

interface MenuRow {
  id: string
  menu_name: string
  menu_type: MenuResourceInput['menuType']
  route_key: string | null
  parent_id: string | null
  permission: string
  sort: number
  status: MenuResourceInput['status']
  revision: number
  created_by: string | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}
const definition = (row: MenuRow) =>
  MENU_ROUTE_CATALOGUE.find((route) => route.key === row.route_key)
const parseDto = (row: MenuRow): MenuResourceInput => ({
  menuName: row.menu_name,
  menuType: row.menu_type,
  ...(row.route_key ? { routeKey: row.route_key } : {}),
  parentId: row.parent_id,
  permission: row.permission,
  sort: row.sort,
  status: row.status,
})
const dto = (row: MenuRow): MenuResourceRecord => ({
  ...parseDto(row),
  id: row.id,
  revision: row.revision,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  deletedAt: row.deleted_at?.toISOString() || null,
  protected: !!definition(row)?.protected,
  path: definition(row)?.path || '',
  componentKey: definition(row)?.componentKey || '',
  permissions:
    definition(row)?.permissions || (row.permission ? [row.permission] : []),
})
export const initializeMenuResources = async (db: Database, tenant: string) => {
  await db.query(
    "INSERT INTO menu_resources(tenant_id,id,menu_name,menu_type,route_key,parent_id,sort) SELECT $1,'default-'||r.key,r.locale,r.menu_type,r.key,CASE WHEN r.parent_key IS NULL THEN NULL ELSE 'default-'||r.parent_key END,r.default_order FROM menu_route_catalogue r WHERE NOT EXISTS(SELECT 1 FROM menu_resources m WHERE m.tenant_id=$1 AND m.route_key=r.key) ON CONFLICT DO NOTHING",
    [tenant]
  )
}
const allRows = (db: Database, actor: Actor) =>
  rows<MenuRow>(
    db,
    'SELECT * FROM menu_resources WHERE tenant_id=$1 ORDER BY sort,id',
    [actor.tenantId]
  )
const menuAllScope = async (db: Database, actor: Actor, permission: string) =>
  one(
    await rows<{ allowed: boolean }>(
      db,
      "SELECT EXISTS(SELECT 1 FROM memberships m WHERE m.tenant_id=$1 AND m.user_id=$2 AND (m.permissions ? $3 OR m.permissions ? '*')) OR EXISTS(SELECT 1 FROM member_roles mr JOIN roles r ON r.tenant_id=mr.tenant_id AND r.id=mr.role_id JOIN role_permissions p ON p.tenant_id=r.tenant_id AND p.role_id=r.id JOIN role_member_scopes s ON s.tenant_id=r.tenant_id AND s.role_id=r.id WHERE mr.tenant_id=$1 AND mr.user_id=$2 AND p.permission_code=$3 AND r.status='enabled' AND r.deleted_at IS NULL AND s.data_scope IN('all','tenant')) AS allowed",
      [actor.tenantId, actor.userId, permission]
    )
  ).allowed
const requireMenuScope = async (
  db: Database,
  actor: Actor,
  permission: string,
  row: MenuRow,
  allScope?: boolean
) => {
  if (allScope ?? (await menuAllScope(db, actor, permission))) return
  const visible =
    row.created_by &&
    one(
      await rows<{ visible: boolean }>(
        db,
        'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
        [actor.tenantId, actor.userId, permission, row.created_by]
      )
    ).visible
  if (!visible) throw new DomainError(404, 'NOT_FOUND', '资源不存在')
}
const scopedMenuRows = async (
  db: Database,
  actor: Actor,
  permission: string
) => {
  const all = await menuAllScope(db, actor, permission)
  return rows<MenuRow>(
    db,
    'SELECT * FROM menu_resources WHERE tenant_id=$1 AND ($2::boolean OR af_historical_member_scope_visible($1,$3,$4,created_by)) ORDER BY sort,id',
    [actor.tenantId, all, actor.userId, permission]
  )
}
const located = (db: Database, actor: Actor, id: string) =>
  rows<MenuRow>(
    db,
    'SELECT * FROM menu_resources WHERE tenant_id=$1 AND id=$2',
    [actor.tenantId, id]
  ).then(one)
const enabled = (row: MenuRow, all: MenuRow[]) => {
  const seen = new Set<string>()
  let current: MenuRow | undefined = row
  while (current) {
    if (
      seen.has(current.id) ||
      current.status !== 'enabled' ||
      current.deleted_at
    )
      return false
    seen.add(current.id)
    if (!current.parent_id) return true
    const parentId: string | null = current.parent_id
    current = all.find((parent) => parent.id === parentId)
  }
  return false
}
const matchPermissions = (
  actor: Actor,
  required: string[],
  mode: 'any' | 'all' = 'any'
) =>
  !required.length ||
  (mode === 'all'
    ? required.every((code) => hasPermission(actor.permissions, code))
    : required.some((code) => hasPermission(actor.permissions, code)))
export const menuNavigationState = async (db: Database, actor: Actor) => {
  const all = await allRows(db, actor)
  const visit = (parentId: string | null): CapabilityMenuNode[] =>
    all
      .filter(
        (row) =>
          row.parent_id === parentId &&
          row.menu_type !== 'button' &&
          enabled(row, all)
      )
      .flatMap((row) => {
        const route = definition(row)
        const children = visit(row.id)
        if (row.menu_type === 'catalog' && !children.length) return []
        if (
          row.menu_type === 'menu' &&
          (!route || !matchPermissions(actor, route.permissions, route.mode))
        )
          return []
        return [
          {
            name:
              row.route_key && row.id === `default-${row.route_key}`
                ? row.route_key
                : `menu-entry-${row.id}`,
            path: route?.path || `/navigation/${row.id}`,
            componentKey: route?.componentKey || 'DefaultLayout',
            meta: {
              requireAuth: true,
              locale: route?.locale || '',
              ...(row.menu_type === 'menu' && route
                ? { targetRouteName: route.key }
                : {}),
              ...(row.menu_name !== route?.locale
                ? { text: row.menu_name }
                : {}),
              order: row.sort,
              ...(route?.permissions.length
                ? {
                    access: {
                      permissions: route.permissions,
                      mode: route.mode,
                    },
                  }
                : {}),
            },
            ...(children.length ? { children } : {}),
          },
        ]
      })
  return {
    menus: visit(null),
    disabledButtons: all
      .filter(
        (row) =>
          row.menu_type === 'button' &&
          !enabled(row, all) &&
          hasPermission(actor.permissions, row.permission)
      )
      .map((row) => ({
        parentRoute:
          definition(one(all.filter((parent) => parent.id === row.parent_id)))
            ?.key || '',
        permission: row.permission,
      })),
  }
}
export const menuRouteAccess = async (
  db: Database,
  actor: Actor,
  name: string
) => {
  const alias = MENU_ROUTE_ALIASES[name]
  const route = MENU_ROUTE_CATALOGUE.find(
    (item) => item.key === (alias?.routeKey || name)
  )
  if (!route) return false
  const all = await allRows(db, actor)
  const accessible = all.some(
    (row) => row.route_key === route.key && enabled(row, all)
  )
  return (
    accessible &&
    matchPermissions(
      actor,
      alias?.permissions || route.permissions,
      alias ? 'any' : route.mode
    )
  )
}
const protectedSubtree = (id: string, all: MenuRow[]): boolean => {
  const descendants = new Set([id])
  let previous = -1
  while (previous !== descendants.size) {
    previous = descendants.size
    all
      .filter(
        (row) =>
          row.parent_id && descendants.has(row.parent_id) && !row.deleted_at
      )
      .forEach((row) => descendants.add(row.id))
  }
  return all.some(
    (row) => descendants.has(row.id) && definition(row)?.protected
  )
}
const validateGraph = async (
  db: Database,
  actor: Actor,
  input: MenuResourceInput,
  all: MenuRow[],
  old?: MenuRow
) => {
  if (
    old &&
    (old.menu_type !== input.menuType ||
      old.route_key !== (input.routeKey || null) ||
      old.permission !== input.permission)
  )
    throw new DomainError(
      422,
      'MENU_BINDING_IMMUTABLE',
      '资源类型、登记页面及按钮权限不能重定向'
    )
  if (
    old &&
    protectedSubtree(old.id, all) &&
    (input.status === 'disabled' || old.parent_id !== input.parentId)
  )
    throw new DomainError(
      409,
      'MENU_GOVERNANCE_PROTECTED',
      '管理及本人凭据入口不能停用或移动'
    )
  if (input.menuType === 'button') {
    if (
      all.some(
        (row) =>
          row.id !== old?.id &&
          row.parent_id === input.parentId &&
          row.permission === input.permission &&
          row.menu_type === 'button'
      )
    )
      throw new DomainError(
        409,
        'MENU_BUTTON_EXISTS',
        '该页面的按钮权限已有资源，请恢复或编辑原资源'
      )
    const parent = one(
      all.filter((row) => row.id === input.parentId && !row.deleted_at)
    )
    if (parent.menu_type !== 'menu')
      throw new DomainError(
        422,
        'MENU_PARENT_INVALID',
        '按钮必须位于登记页面下'
      )
    requirePermission(actor.permissions, input.permission)
    if (
      !(
        await rows(
          db,
          "SELECT code FROM permission_definitions WHERE code=$1 AND status='enabled'",
          [input.permission]
        )
      ).length ||
      input.permission.startsWith('system:menu:') ||
      input.permission === 'account:password:update'
    )
      throw new DomainError(
        422,
        'MENU_PERMISSION_INVALID',
        '按钮权限未登记或属于保护能力'
      )
  }
  if (input.parentId) {
    let parent = all.find((row) => row.id === input.parentId && !row.deleted_at)
    if (!parent) throw new DomainError(404, 'NOT_FOUND', '父资源不可访问')
    if (input.menuType !== 'button' && parent.menu_type !== 'catalog')
      throw new DomainError(
        422,
        'MENU_PARENT_INVALID',
        '页面及目录只能属于目录'
      )
    const seen = new Set<string>(old ? [old.id] : [])
    while (parent) {
      if (seen.has(parent.id))
        throw new DomainError(422, 'MENU_CYCLE', '菜单层级不能成环')
      seen.add(parent.id)
      const ancestorId: string | null = parent.parent_id
      parent = ancestorId ? all.find((row) => row.id === ancestorId) : undefined
    }
  }
}
function awaitRegistration(
  server: FastifyInstance,
  pool: Pool,
  command: (
    actor: Actor,
    kind: 'delete' | 'restore',
    id: string,
    key: string | undefined,
    input: { expectedRevision: number }
  ) => Promise<MenuResourceRecord>
) {
  const handler =
    (kind: 'delete' | 'restore') =>
    async (request: Parameters<typeof authenticate>[1]) => {
      const actor = await authenticate(pool, request)
      const id = text(record(request.params).id, 'id', 100)
      const body = record(request.body)
      onlyKeys(body, ['expectedRevision'])
      return {
        code: 20000,
        data: await command(
          actor,
          kind,
          id,
          scalarHeader(request, 'idempotency-key'),
          { expectedRevision: positiveInteger(body.expectedRevision) }
        ),
      }
    }
  server.delete('/api/system/menus/:id', handler('delete'))
  server.post('/api/system/menus/:id/restore', handler('restore'))
}

export const registerMenuResources = (
  server: FastifyInstance,
  pool: Pool,
  fault: FaultInjector
) => {
  const menu = async (request: Parameters<typeof authenticate>[1]) => {
    const actor = await authenticate(pool, request)
    return {
      code: 20000,
      data: (
        await authorizedTransaction(pool, actor, undefined, (db, current) =>
          menuNavigationState(db, current)
        )
      ).menus,
    }
  }
  server.get('/api/user/menu', menu)
  server.post('/api/user/menu', menu)
  server.get('/api/navigation/state', async (request) => {
    const actor = await authenticate(pool, request)
    return {
      code: 20000,
      data: await authorizedTransaction(pool, actor, undefined, (db, current) =>
        menuNavigationState(db, current)
      ),
    }
  })
  server.get('/api/navigation/access/:name', async (request) => {
    const actor = await authenticate(pool, request)
    const name = text(record(request.params).name, 'name', 100)
    return {
      code: 20000,
      data: {
        allowed: await authorizedTransaction(
          pool,
          actor,
          undefined,
          (db, current) => menuRouteAccess(db, current, name)
        ),
      },
    }
  })
  server.get('/api/system/menus/catalogue', async (request) => {
    const actor = await authenticate(pool, request)
    return {
      code: 20000,
      data: await authorizedTransaction(
        pool,
        actor,
        P.list,
        async (db, current) => {
          const all = await scopedMenuRows(db, current, P.list)
          const permissions = await rows<{ code: string; title: string }>(
            db,
            "SELECT code,title FROM permission_definitions WHERE status='enabled' ORDER BY code"
          )
          return {
            routes: MENU_ROUTE_CATALOGUE,
            parents: all
              .filter((row) => !row.deleted_at && row.menu_type !== 'button')
              .map(dto),
            permissions: permissions.filter(
              (item) =>
                hasPermission(current.permissions, item.code) &&
                !item.code.startsWith('system:menu:') &&
                item.code !== 'account:password:update'
            ),
          }
        }
      ),
    }
  })
  server.get('/api/system/menus', async (request) => {
    const actor = await authenticate(pool, request)
    const page = pageQuery(request.query)
    const query = record(request.query || {})
    const status = query.status || ''
    if (!['', 'enabled', 'disabled', 'deleted'].includes(String(status)))
      throw new DomainError(422, 'MENU_INVALID', '状态筛选无效')
    const keyword =
      typeof query.menuName === 'string' && query.menuName.trim()
        ? text(query.menuName, 'menuName', 100).trim()
        : page.keyword
    return {
      code: 20000,
      data: await authorizedTransaction(pool, actor, P.list, async (db) => {
        const globalScope = await menuAllScope(db, actor, P.list)
        const values = [
          actor.tenantId,
          `%${keyword}%`,
          status,
          globalScope,
          actor.userId,
          P.list,
        ]
        const filter =
          "WHERE tenant_id=$1 AND menu_name ILIKE $2 AND (($3='deleted' AND deleted_at IS NOT NULL) OR ($3<>'deleted' AND deleted_at IS NULL AND ($3='' OR status=$3))) AND ($4::boolean OR af_historical_member_scope_visible($1,$5,$6,created_by))"
        const total = one(
          await rows<{ total: string }>(
            db,
            `SELECT count(*) AS total FROM menu_resources ${filter}`,
            values
          )
        )
        const list = await rows<MenuRow>(
          db,
          `SELECT * FROM menu_resources ${filter} ORDER BY sort,id LIMIT $7 OFFSET $8`,
          [...values, page.pageSize, page.offset]
        )
        return { list: list.map(dto), total: Number(total.total) }
      }),
    }
  })
  server.get('/api/system/menus/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    return {
      code: 20000,
      data: await authorizedTransaction(
        pool,
        actor,
        P.detail,
        async (db, current) => {
          const row = await located(db, current, id)
          await requireMenuScope(db, current, P.detail, row)
          return dto(row)
        }
      ),
    }
  })
  const command = async (
    actor: Actor,
    kind: 'create' | 'update' | 'delete' | 'restore',
    id: string,
    key: string | undefined,
    input: MenuResourceInput | { expectedRevision: number }
  ) =>
    idempotent(
      pool,
      actor,
      P[kind === 'restore' ? 'update' : kind],
      `menu:${kind}:${id}`,
      key,
      input,
      async (db, current) => {
        const all = await allRows(db, current)
        const old =
          kind === 'create'
            ? undefined
            : one(all.filter((row) => row.id === id))
        const permission = P[kind === 'restore' ? 'update' : kind]
        const globalScope = await menuAllScope(db, current, permission)
        if (old)
          await requireMenuScope(db, current, permission, old, globalScope)
        const graphInput = input as MenuResourceInput
        if (graphInput.parentId)
          await requireMenuScope(
            db,
            current,
            permission,
            one(all.filter((row) => row.id === graphInput.parentId)),
            globalScope
          )
        if (
          (graphInput.menuType === 'button' || old?.menu_type === 'button') &&
          !globalScope
        )
          throw new DomainError(
            403,
            'MENU_SCOPE_REQUIRED',
            '租户按钮策略需要本租户完整菜单管理范围'
          )
        if (
          old &&
          (kind === 'delete' ||
            graphInput.parentId !== old.parent_id ||
            graphInput.status !== old.status)
        ) {
          const affected = new Set([old.id])
          let count = -1
          while (count !== affected.size) {
            count = affected.size
            all
              .filter(
                (row) =>
                  row.parent_id &&
                  affected.has(row.parent_id) &&
                  !row.deleted_at
              )
              .forEach((row) => affected.add(row.id))
          }
          await all
            .filter((row) => affected.has(row.id))
            .reduce(async (previous, row) => {
              await previous
              await requireMenuScope(db, current, permission, row, globalScope)
            }, Promise.resolve())
        }
        if (old) assertRevision(old.revision, input.expectedRevision as number)
        if (kind === 'create' || kind === 'update') {
          const body = input as MenuResourceInput
          if (old?.deleted_at)
            throw new DomainError(409, 'MENU_DELETED', '请先恢复已删除资源')
          await validateGraph(db, current, body, all, old)
          if (kind === 'create') {
            id = randomUUID()
            await db.query(
              'INSERT INTO menu_resources(tenant_id,id,menu_name,menu_type,route_key,parent_id,permission,sort,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
              [
                current.tenantId,
                id,
                body.menuName,
                body.menuType,
                body.routeKey || null,
                body.parentId,
                body.permission,
                body.sort,
                body.status,
                current.userId,
              ]
            )
          } else
            await db.query(
              'UPDATE menu_resources SET menu_name=$3,parent_id=$4,sort=$5,status=$6,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
              [
                current.tenantId,
                id,
                body.menuName,
                body.parentId,
                body.sort,
                body.status,
              ]
            )
        } else if (kind === 'delete') {
          if (protectedSubtree(id, all))
            throw new DomainError(
              409,
              'MENU_GOVERNANCE_PROTECTED',
              '管理及本人凭据入口不能删除'
            )
          if (old?.deleted_at)
            throw new DomainError(409, 'MENU_DELETED', '资源已删除')
          if (all.some((row) => row.parent_id === id && !row.deleted_at))
            throw new DomainError(409, 'MENU_REFERENCED', '请先处理子资源')
          await db.query(
            'UPDATE menu_resources SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id]
          )
        } else {
          if (!old?.deleted_at)
            throw new DomainError(409, 'MENU_NOT_DELETED', '资源未删除')
          if (
            old.parent_id &&
            !all.some((row) => row.id === old.parent_id && !row.deleted_at)
          )
            throw new DomainError(409, 'MENU_PARENT_DELETED', '请先恢复父资源')
          await db.query(
            'UPDATE menu_resources SET deleted_at=NULL,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id]
          )
        }
        fault('menu:changed')
        await audit(db, current, 'system', `menu.${kind}`, 'menu', id)
        return dto(await located(db, current, id))
      },
      true,
      '',
      async (db, current, response) => {
        const row = await located(db, current, response.id)
        await requireMenuScope(
          db,
          current,
          P[kind === 'restore' ? 'update' : kind],
          row
        )
        return response
      }
    )
  server.post('/api/system/menus', async (request) => {
    const actor = await authenticate(pool, request)
    const body = parseMenuResource(request.body)
    return {
      code: 20000,
      data: await command(
        actor,
        'create',
        '',
        scalarHeader(request, 'idempotency-key'),
        body
      ),
    }
  })
  server.put('/api/system/menus/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = parseMenuResource(request.body, true)
    return {
      code: 20000,
      data: await command(
        actor,
        'update',
        id,
        scalarHeader(request, 'idempotency-key'),
        body
      ),
    }
  })
  awaitRegistration(server, pool, command)
}

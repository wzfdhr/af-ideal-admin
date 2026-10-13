# Auth And Permission Architecture

AF-Ideal-Admin uses token-based login, route metadata, Pinia user state, and
Vue Router guards to control page access.

## Login Flow

1. The login page submits credentials through `src/api/user.ts`.
2. `src/store/modules/user.ts` stores the returned token with `setToken`.
3. `src/router/guards/login-guard.ts` loads user info when a token exists but
   the current role is still empty.
4. `src/api/request.ts` attaches the token to `X-Access-Token`.
5. Logout clears token, role, async menu state, route listeners, and user state.

## API Path Contract

`VITE_API_BASE_URL` owns the API prefix. Business API modules should use
resource paths without repeating that prefix:

```ts
axios.post('/user/login', data)
axios.get('/business/groups')
```

With `VITE_API_BASE_URL=/api`, those requests become `/api/user/login` and
`/api/business/groups`.

## Route Permission Contract

Every protected route should use:

```ts
meta: {
  requireAuth: true,
  roles: ['admin']
}
```

Rules:

- Missing `requireAuth` means the route is public.
- Missing `roles` on an authenticated route means every logged-in role can
  access it.
- `roles: ['*']` means every logged-in role can access it.
- Specific roles such as `roles: ['admin']` restrict access to those roles.
- Nested routes inherit practical restrictions through matched route records,
  so parent and child metadata both matter.

Route metadata can also use the unified access model when permission codes are
available:

```ts
meta: {
  requireAuth: true,
  access: {
    permissions: ['user:create'],
    mode: 'any'
  }
}
```

## Button Permission Contract

Buttons should use action permission codes instead of role names for new
features. Use the `domain:action` format:

- `user:create`
- `user:update`
- `user:delete`
- `role:assign`
- `report:export`

Recommended usage:

```vue
<PermissionButton permission="user:create">
  新增用户
</PermissionButton>
```

The legacy directive remains compatible with role arrays:

```vue
<a-button v-allow="['admin']">管理员操作</a-button>
```

For new code, `v-allow` may receive a permission code directly:

```vue
<a-button v-allow="'user:create'">新增用户</a-button>
```

## Menu Source

`config/index.ts` controls menu source through `menuFromServer`.

- `false`: use local routes and `src/router/menu`.
- `true`: call `/api/user/menu` and render server-provided menu entries.

Server-provided menu entries must follow the same route names and access
contract as local routes. The frontend uses `name` as the trusted route key:

```ts
{
  name: 'system:user',
  path: 'user',
  componentKey: 'SystemUserPage',
  meta: {
    requireAuth: true,
    access: {
      permissions: ['system:user:view']
    }
  }
}
```

Rules:

- The backend must not send executable component paths.
- `componentKey` must map to a frontend-maintained whitelist before a route can
  be registered.
- Unknown or missing menu `name` values are ignored by direct route access
  checks and must not crash menu processing.
- Server menus are filtered again on the frontend by role and permission code,
  so unauthorized menus are not rendered even when the backend returns them.
- Direct access is allowed only when the target route exists in the flattened
  server menu name set and the current user passes route access checks.

## Unauthorized Behavior

`toNoPermissionPage` controls the fallback for an authenticated user without
route access.

- `true`: route to `not-allowed`.
- `false`: route to the first accessible route for the current role.


## Persistent tenant navigation increment (FP-007)

Production/reference mode loads `/navigation/state` on protected navigation and checks `/navigation/access/:name` using the current session. Explicit development Mock retains the configured local tree. `menuFromServer` still controls legacy Mock server-menu mode; a tenant context by itself does not select the new backend protocol.

`menu_resources` owns a tenant-qualified identity, parent, type, registration key or button permission, order, status, revision and deletion tombstone. `/system/menus` commands require the corresponding permission, version and idempotency key; mutations, receipt and success audit commit together. The immutable route catalogue supplies components, paths and base permissions. Custom captions are plain text. Multiple references to the same registered page have separate menu identities and a controlled `targetRouteName`; access is available only while at least one reference and its ancestors are enabled and the actor holds the page's base capability.

Button resources control the visibility of operations on their registered page, including aliases. They never grant business capabilities or rewrite the user's canonical authorization state. PermissionButton, the permission directive and UI predicates apply current visibility rules; backend business/object/field authorization remains independent. Menu management, workplace and self-service credential entries and their ancestors remain reachable for an actor who holds their actual capabilities. Generic resource edits cannot weaken base permissions or replace component bindings.

Migration 022 initializes existing tenants once; explicit new-platform/demo initialization creates the same defaults without restoring tombstones or overwriting customization. Disable/delete/restore retain versioned facts. Preserve 022 and a compatible execution service on rollback; do not auto-drop resource facts. Reverting just the client to the old static menu would ignore tenant navigation restrictions and is not a validated compatible rollback. Current evidence and remaining deployment/performance gates are in `full-product-delivery-tasks.md`.


Menu configuration metadata uses current creator/member scope for list, detail, parent choices, writes and replayed receipts. Default shared resources have no personal creator and require complete scope within the current tenant for configuration access. Parent changes and disable/delete validate affected descendants; a scoped editor cannot move or disable an unseen subtree. Page-wide button policy requires complete tenant menu scope. These metadata rules do not replace runtime page/business permissions; navigation exposes only registered pages the actor is entitled to visit.

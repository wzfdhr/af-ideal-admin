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

## Menu Source

`config/index.ts` controls menu source through `menuFromServer`.

- `false`: use local routes and `src/router/menu`.
- `true`: call `/api/user/menu` and render server-provided menu entries.

Server-provided menu entries should use the same route names and `meta.roles`
contract as local routes.

## Unauthorized Behavior

`toNoPermissionPage` controls the fallback for an authenticated user without
route access.

- `true`: route to `not-allowed`.
- `false`: route to the first accessible route for the current role.

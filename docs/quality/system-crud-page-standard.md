# System CRUD Page Standard

This standard starts with the dictionary management page and should be reused
for user, role, menu, and department modules.

## Page Contract

- Use `ProForm` for query and editor forms.
- Use `ProTable` for paged list loading.
- Use `PermissionButton` for every create, update, delete, detail, export, or
  import action.
- Use dictionary service options for select fields and table enum display.
- Keep detail, editor, and delete confirmation in explicit modal states.
- Never hide failed requests silently. Show a message and keep the page in a
  recoverable state.

## API Contract

Each system module should expose:

- `fetchXxxList(query)` for paged query.
- `getXxxDetail(id)` for detail.
- `createXxx(payload)` for create.
- `updateXxx(id, payload)` for edit.
- `deleteXxx(id)` for delete.
- `XXX_PERMISSIONS` for all action-level permission codes.

Mock APIs must use the same URL and response shape as the API boundary:

```ts
{
  code: 20000,
  msg: 'success',
  data: {
    list: [],
    total: 0
  }
}
```

## Test Contract

Each migrated system module should include:

- API tests for endpoint, params, and payload shape.
- Page tests for initial `ProTable` loading.
- Page tests for query form submitting filters to the table.
- Page tests for permission action rendering.
- Page tests for dangerous operations requiring confirmation before calling API.

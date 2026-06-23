# UI Adapter Lab

UI Adapter Lab is the `T-200A.3` Mock-backed validation page for the replaceable
UI foundation. It proves that Pro components and the `adminUi` adapter boundary
can run real business interactions before `aheart-ui` is allowed into candidate
or production use.

## Scope

- Route: `/examples/ui-adapter-lab`
- Page: `src/views/examples/ui-adapter-lab/index.vue`
- API: `src/api/ui-adapter-lab.ts`
- Mock: `src/mock/modules/ui-adapter-lab.ts`
- Permissions: `src/constants/ui-adapter-lab.ts`

## API Contract

- `GET /ui-adapter-lab/items`: query validation items with pagination,
  keyword, and status filters.
- `POST /ui-adapter-lab/items`: create a candidate component validation item.
- `PUT /ui-adapter-lab/items/:id`: update a candidate component validation item.
- `POST /ui-adapter-lab/error`: simulate a controlled Mock error state with a
  trace id.

## Permission Codes

- `ui-adapter-lab:view`: enter and query the lab.
- `ui-adapter-lab:create`: create validation items.
- `ui-adapter-lab:update`: update validation items.
- `ui-adapter-lab:error`: trigger the controlled error-state simulation.

## Mock-Backed Interactions

The page must remain a real interaction lab, not a static component gallery.
The current MVP covers:

- `ProTable`: list query and pagination through Mock data.
- `ProForm`: query form and create/edit form submission.
- `PermissionButton`: create, edit, detail, and error-state controls.
- `Modal`: create/edit validation item workflow.
- `Drawer`: validation item detail workflow.
- `Mock` empty state: querying `no-such-component` returns no records and
  displays `空态`.
- `Mock` error state: `/ui-adapter-lab/error` returns
  `Mock adapter service unavailable` with `mock-ui-adapter-lab-500`.
- 错误态：页面必须展示 Mock 返回的错误原因和 trace id，方便后续对齐真实
  request error 处理。

## Acceptance Standard

The lab is accepted only when it has a route, menu entry, API contract, Mock
store, permission codes, page tests, Mock tests, route tests, and documentation.
Arco stays the active adapter. `aheart-ui` remains blocked from becoming the
production default until the maturity matrix, candidate adapter, lab page, real
page migration rehearsal, and rollback governance all pass.

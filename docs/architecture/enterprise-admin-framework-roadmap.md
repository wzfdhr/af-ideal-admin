# Enterprise Admin Framework Roadmap

## Purpose

AF-Ideal-Admin should evolve from a Vue admin template into an enterprise-grade
middle/back-office framework. The target is a reusable foundation that can be
used for real customer projects, supports backend integration, and keeps
authentication, authorization, request handling, business components, testing,
and documentation under clear contracts.

## Current Baseline

The project already has a useful foundation:

- Vue 3, TypeScript, Vite, Arco Design Vue, Pinia, Vue Router, Sass, and
  Tailwind CSS.
- Route modules, layouts, menu rendering, login guards, permission guards, and
  button permission directives.
- Axios interceptors, Mock.js development APIs, dashboard/list/form/system
  examples, and a form designer.
- Unit tests for auth storage, permission logic, and form rule parsing.
- CI workflow covering lint, typecheck, unit tests, build, and e2e tests.

Important current risks:

- The request layer uses global Axios defaults and interceptors, which makes
  multi-service APIs, upload/download flows, retries, cancellation, tracing, and
  test isolation harder.
- Server-side menu mode is not fully implemented in the permission guard.
- Permission is role-centered. Enterprise projects usually need permission
  codes, actions, menu resources, department or tenant scope, and data
  permissions.
- Menu generation deep-clones route records with JSON serialization, losing
  rich values and weakening route/menu typing.
- The repository still carries generated archives such as `dist.zip` and
  `node_modules.zip`.
- The form designer has high product value, but its schema, runtime renderer,
  editor, and remote data-source safety need clearer boundaries.
- Mock is available, but it is not yet a first-class virtual data platform for
  demos, tests, backend-independent development, error scenarios, workflows,
  dashboards, reports, or low-code pages.

## Product Positioning

The framework should serve three audiences:

- Framework maintainers: evolve core architecture, contracts, and shared
  components safely.
- Business developers: build CRUD, workflow, dashboard, and form pages quickly
  without rewriting infrastructure.
- Delivery teams: connect to a real backend, configure permissions, deploy, and
  diagnose issues with predictable documentation and CI checks.

## Target Architecture

### 1. Application Shell

Owns layout, theme, route view, menu, top bar, tab bar, breadcrumb, locale,
page cache, and global loading/error states.

Expected capabilities:

- Collapsible side menu and responsive layout.
- Dynamic page title and breadcrumb from route metadata.
- Optional tab bar with cache rules based on route names.
- Theme tokens, dark mode, compact mode, and tenant or brand overrides.
- User menu, notifications, help links, and logout flow.

### 2. Request And API Layer

Replace global Axios mutation with isolated clients.

Recommended contract:

```ts
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  traceId?: string
  errors?: Record<string, string[]>
}

export interface RequestClientOptions {
  baseURL: string
  timeout: number
  authHeaderName: string
}
```

Expected capabilities:

- `createRequestClient(options)` returns an Axios instance with typed helpers.
- Request auth injection reads token from one auth service, not from scattered
  storage reads.
- Response strategy handles success, business errors, 401, 403, 404, 500, and
  network failures separately.
- Support upload, download, blob response, cancellation, idempotent retry, and
  request deduplication where needed.
- Surface `traceId` in error messages so operations teams can correlate logs.

### 3. Authentication And Authorization

Move from role-only checks to a layered access model.

Recommended model:

```ts
export interface AuthUser {
  id: string
  name: string
  roles: string[]
  permissions: string[]
  tenantId?: string
  departmentIds?: string[]
}

export interface AccessRequirement {
  roles?: string[]
  permissions?: string[]
  mode?: 'all' | 'any'
}
```

Expected capabilities:

- Route access from `meta.access`.
- Button access through permission codes such as `user:create`.
- Menu visibility from the same access engine as route access.
- Data-scope metadata for backend queries: tenant, department, owner, custom
  scope.
- Server menu mode maps safe component keys to local lazy imports instead of
  accepting arbitrary component paths.

### 4. Domain Modules

The base product modules should become real reusable examples, not only visual
pages:

- User management.
- Role and permission management.
- Menu and route resource management.
- Department and organization tree.
- Dictionary management.
- Login logs and operation audit logs.
- Notification center.

Each module should own:

- API contract.
- Type definitions.
- Route registration.
- Permission codes.
- Table/form page implementation.
- Unit tests for critical logic.

### 5. UI Foundation And Pro Components

Create a small internal component layer above Arco and keep it compatible with a
future `aheart-ui` adapter:

```txt
Business pages
  -> Pro components: ProTable, ProForm, CrudPage, DictSelect
  -> UI adapter: ArcoAdapter now, AheartAdapter later
  -> Base UI library: Arco Design Vue or aheart-ui
```

The current product should continue to use Arco Design Vue for stable delivery.
`aheart-ui` should be developed in parallel as the future design system
candidate, but it should not replace Arco in core enterprise modules until its
table, form, select, date/time, upload, tree, cascader, theme, accessibility,
documentation, test, and Mock-backed demo coverage pass the enterprise
readiness checklist.

Create a small internal component layer above the UI adapter:

- `ProTable`: query form, pagination, column schema, column visibility, batch
  actions, row actions, loading state, empty state, and export hooks.
- `ProForm`: schema fields, async options, validation, readonly/detail mode,
  submit lifecycle, and field linkage.
- `ProModal`: consistent create/edit/detail modal workflows.
- `DictSelect` and `DictRadio`: dictionary-backed field components.
- `PermissionButton`: action button with permission and disabled reason.

These components should reduce repeated page code, but stay thin enough that
business teams can still understand the generated pages.

Rules:

- New enterprise pages should not directly depend on the base UI library.
- Existing pages may keep Arco while being migrated module by module.
- Pro components must use Mock-backed examples for list, form, permission,
  empty-state, and error-state validation.
- The `aheart-ui` adapter can be introduced gradually after the corresponding
  base component reaches enterprise readiness.

### 6. Form Designer Platform

The form designer should be treated as a product subsystem.

Boundaries:

- `schema`: versioned schema types, migrations, validators, examples.
- `designer`: drag, config panels, widget palette, preview, import/export.
- `renderer`: production runtime renderer, readonly mode, validation, submit.
- `datasource`: remote options, whitelisted endpoints, parameter mapping,
  timeout, caching, and error states.

Expected capabilities:

- Schema version and migration function for future compatibility.
- JSON import/export and preview.
- Safe rule parsing only; no executable user-provided expressions.
- Remote data source whitelist and typed response adapter.
- Tests for widget defaults, required validation, remote options, and schema
  migration.

### 7. Engineering Governance

Expected standards:

- One package manager and one lockfile.
- No generated build archives in git.
- TypeScript strict mode kept on, with `any` reduced in core paths.
- Lint, typecheck, unit tests, build, and e2e checks in CI.
- Conventional commits and changelog for framework releases.
- Architecture docs and page development guides kept in the repo.

### 8. Mock Virtual Data Platform

Every enterprise framework capability should be demonstrable without a real
backend. Mock data must act as the first API contract, not as throwaway sample
data.

Expected capabilities:

- Domain-based Mock modules for auth, user, permission, menu, dictionary,
  workflow, form designer, low-code pages, dashboard, reports, audit logs, and
  messages.
- Common response helpers for success, business error, unauthorized, forbidden,
  empty data, timeout, and server error scenarios.
- Scenario switching for admin, operator, limited-role user, tenant A, tenant B,
  and error-state demos.
- Pagination, filtering, sorting, create, update, delete, detail, and batch
  operation simulation.
- Stable Mock data for unit and e2e tests.
- Data contracts that mirror real backend APIs so the frontend can switch from
  Mock to real services without rewriting page logic.

### 9. Workflow Designer

The framework should include a workflow designer for approvals, work orders,
state transitions, and business process orchestration.

Expected capabilities:

- Visual node-and-edge canvas, preferably reusing the existing AntV X6
  dependency.
- Start, approval, copy, condition, parallel, and end nodes.
- Node property panel and safe condition configuration.
- Form binding through the form designer schema.
- Process definition preview, validation, publish, disable, and versioning.
- Mock process definitions, process instances, todo items, done items, approval
  records, rejection, transfer, withdraw, and completion flows.

### 10. Low-Code Page Builder

The framework should support common page construction by configuration while
keeping custom code available for complex modules.

Expected capabilities:

- Page schema for layouts, sections, tables, forms, charts, buttons, and events.
- Material registry for ProTable, ProForm, chart cards, statistic cards,
  workflow panels, and custom widgets.
- Data-source binding for Mock APIs, REST APIs, and static JSON.
- Event configuration for search, submit, navigate, open modal, refresh block,
  and trigger workflow.
- Page-level, block-level, and action-level permissions.
- Preview, save, publish, rollback, and schema export.
- Mock-driven low-code demos that work without backend services.

### 11. Data Screen And Report Center

The framework should support dashboard and large-screen simulation, not only
standard CRUD pages.

Expected capabilities:

- Large-screen canvas based on a 1920x1080 design baseline with responsive
  scaling.
- Chart widgets for line, bar, pie, map, ranking, KPI cards, scrolling tables,
  and alert lists.
- Drag, resize, align, layer, theme, preview, and full-screen playback.
- Mock real-time data, polling data, metric fluctuations, map points, rankings,
  and alarms.
- Report list, report detail, query conditions, export task simulation, metric
  definitions, and field-level permission support.

## Roadmap

### P0: Repository And Delivery Baseline

Goal: make the repository clean, reproducible, and safe to build.

- Synchronize local `framework` with `origin/framework`.
- Delete obsolete remote branches after confirming default branch contains the
  relevant commits.
- Remove `dist.zip` and `node_modules.zip`.
- Fix `.gitignore` for generated archives and local runtime output.
- Keep npm as the default package manager because `package-lock.json` exists.
- Add or verify CI jobs for lint, typecheck, tests, build, and e2e.

### P1: Enterprise Request, Auth, And Permission Core

Goal: make the framework safe to connect to a real backend.

- Create an isolated request client.
- Implement response error strategy and 401/403 behavior.
- Introduce auth service and access service boundaries.
- Upgrade route and button permissions to permission-code based checks.
- Complete server-side menu mode with component key mapping.
- Add tests for permission inheritance, button checks, token clearing, and
  server menu filtering.

### P2: Business Component Layer

Goal: reduce repeated code in CRUD and settings pages.

- Add a replaceable UI adapter boundary for Arco now and `aheart-ui` later.
- Build `ProTable`.
- Build `ProForm`.
- Build dictionary-backed field components.
- Convert system user, role, menu, department, and dictionary pages to use the
  shared components.
- Document the standard CRUD page pattern.

### P3: Form Designer Productization

Goal: make the form designer stable enough for production use.

- Add schema versioning.
- Split schema, designer, renderer, and datasource responsibilities.
- Add schema migration and validation.
- Add remote data source safety controls.
- Add tests around widget rendering, rule parsing, schema migration, and
  datasource behavior.

### P4: Observability, Security, And Operations

Goal: make production issues diagnosable and security posture explicit.

- Add front-end error boundary and route error reporting hook.
- Add request trace ID display and logging.
- Add operation audit log examples.
- Document token storage tradeoffs and CSP recommendations.
- Add deployment templates for Nginx and containerized hosting.

### P5: Documentation And Framework Experience

Goal: make the framework easy to adopt by another team.

- Build a documentation index.
- Add a "create a page" guide.
- Add backend integration guide.
- Add permission integration guide.
- Add release checklist and migration notes.
- Optionally add generator scripts for route, page, API, and tests.

### P6: Mock, Workflow, Low-Code, And Data Visualization Expansion

Goal: expand the framework from a CRUD/admin template into a platform-capable
middle/back-office framework.

- Build the Mock virtual data platform and scenario system.
- Add workflow designer MVP with X6, process schema, node configuration, and
  Mock process instances.
- Add low-code page builder MVP with page schema, material registry, Mock data
  sources, preview, save, and publish simulation.
- Add data-screen MVP with chart materials, large-screen canvas, Mock realtime
  data, and full-screen preview.
- Add report center MVP with report list, query, chart/detail rendering, and
  export task simulation.

## Success Criteria

The framework reaches the enterprise baseline when:

- A new business CRUD module can be created with typed API, route, menu,
  permission, table, form, and tests in under one day.
- A backend team can implement auth, user info, menu, and dictionary APIs from
  documented contracts.
- CI catches lint, type, unit, build, and e2e regressions before merge.
- Permission behavior is covered by tests and works consistently for route,
  menu, and buttons.
- Generated output and local dependency archives are not stored in git.
- The form designer can save, load, migrate, preview, and render versioned
  schemas without executing unsafe user input.
- Every major capability can run end-to-end with Mock data, including success,
  empty, unauthorized, forbidden, server error, and timeout scenarios.
- Workflow, low-code, and large-screen capabilities have at least one complete
  demo each, backed by Mock APIs and permission codes.

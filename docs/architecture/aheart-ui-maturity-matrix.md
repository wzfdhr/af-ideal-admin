# aheart-ui Maturity Matrix

This document tracks `T-200A.1`: the enterprise readiness matrix for using
`aheart-ui` as a future AF-Ideal-Admin UI foundation. Arco Design Vue remains
the production default adapter until the candidate rows below pass their gates.

## Status Rules

- `Pending`: work has not been proven through code, tests, docs, and demos.
- `Partial`: the capability exists but still misses at least one required gate.
- `Ready`: the capability passes every applicable gate for candidate adapter
  use.
- `Blocked`: the component or capability must not replace the production
  default UI foundation.

No row can become part of the production default UI foundation, or `生产默认 UI 底座`,
until Type Contract, States, Theme, A11y, Docs, Unit Tests, Visual Check, and
Mock Demo are all `Ready` or explicitly marked as not applicable with a reason.

## Readiness Matrix

| Area | Component Or Capability | Type Contract | States | Theme | A11y | Docs | Unit Tests | Visual Check | Mock Demo | Candidate Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Core | Button | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Data | Table | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Form | Form | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Form | Input | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Form | Select | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Form | DatePicker | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Data Entry | Upload | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Data Display | Tree | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Data Entry | Cascader | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Feedback | Modal | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Feedback | Drawer | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Feedback | Message | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Feedback | Notification | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Navigation | Tabs | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Navigation | Menu | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Layout | Layout | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Foundation | Theme | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |
| Foundation | A11y | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Blocked: Not ready |

## Gate Definitions

- Type Contract: public props, events, slots, exposes, and TypeScript types are
  documented and compatible with `AdminUiAdapter` or the target Pro component.
- States: loading, disabled, readonly, empty, error, validation, permission,
  focus, hover, active, and destructive states are covered where applicable.
- Theme: light, dark, compact, brand color, radius, spacing, typography, and
  token mapping work with the theme center contract.
- A11y: keyboard operation, focus order, ARIA labels, contrast, reduced motion,
  and screen-reader behavior are checked where applicable.
- Docs: usage docs include enterprise table, form, dialog, drawer, feedback,
  empty, and error-state examples instead of only visual samples.
- Unit Tests: public behavior is covered without coupling tests to internal
  implementation details.
- Visual Check: screenshot smoke or visual regression covers normal and edge
  states.
- Mock Demo: the component is proven in a Mock-backed business flow such as
  list query, pagination, create/edit submit, permission gating, or error
  recovery.

## Update Rule

Update this matrix when a component graduates from `Pending` to `Partial` or
`Ready`. Each update must reference the evidence path: component docs, tests,
Mock-backed page, visual check, and any known parity gap. If evidence is missing,
the row remains `Blocked: Not ready`.

# UI Library Strategy

AF-Ideal-Admin continues to use Arco Design Vue as the stable delivery UI base.
`aheart-ui` should be developed in parallel as the future design system
candidate, but business capability delivery must not wait for it.

## Adapter Boundary

New enterprise pages should depend on internal business components and the UI
adapter boundary instead of directly depending on base UI library APIs.

Preferred dependency direction:

```text
business page -> ProTable / ProForm / CrudPage / DictSelect / PermissionButton
business component -> adminUi adapter contract
adminUi adapter -> Arco now, aheart-ui later
```

The first adapter contract is `src/components/pro-ui`. It exposes the stable
surface needed by upcoming enterprise components:

- Button
- Table
- Form and FormItem
- Input
- Select
- Modal
- Drawer
- Message

## Replacement Rule

Arco remains the active adapter until `aheart-ui` passes the enterprise
readiness checklist for the components being replaced. A direct global switch is
not allowed before a real business page proves equivalent behavior through both
adapters.

## aheart-ui Readiness Checklist

`aheart-ui` may replace Arco in core modules only when these gates are met:

- Core components: table, form, select, date/time, upload, tree, cascader,
  modal, drawer, message, and notification.
- Theme tokens and dark/light mode work consistently.
- Keyboard interaction and accessibility states are covered.
- Component docs include enterprise form, table, dialog, and error-state
  examples.
- Unit tests cover public component behavior.
- Visual regression or screenshot smoke tests cover key states.
- E2E smoke tests cover at least one Mock-backed business workflow.
- The candidate adapter passes the same `AdminUiAdapter` contract tests as the
  Arco adapter.

## Mock-Backed Validation

Every new Pro component must have at least one Mock-backed example. The example
must exercise real loading, empty, error, permission, submit, and pagination
states where applicable. This keeps the adapter boundary honest and avoids
building static demos that do not represent enterprise usage.

## Parallel Development Cadence

The admin framework and `aheart-ui` should move in parallel. The admin product
continues shipping enterprise features through Arco, Pro components, and Mock
contracts. `aheart-ui` matures beside it as a candidate adapter, not as a blocker
for workflow, low-code, dashboard, report, audit, tenant, or system modules.

The synchronization rule is:

1. Build business capabilities in AF-Ideal-Admin through Pro components.
2. Extract repeated UI needs into adapter contracts and Pro component APIs.
3. Implement matching `aheart-ui` components against those contracts.
4. Validate each candidate component through Mock-backed business examples.
5. Replace by component or by page only after parity checks pass.

This keeps switching costs controlled. Business pages depend on stable Pro
contracts, while the base UI implementation can evolve behind the adapter.

## Candidate Adapter Gates

An `aheart-ui` component can enter the candidate adapter only after it satisfies
all applicable gates:

- Public props, events, slots, and exposes are typed and documented.
- Loading, disabled, readonly, empty, error, validation, and permission-adjacent
  states match the Arco-backed Pro component behavior.
- Unit tests cover public behavior instead of implementation details.
- Visual smoke or screenshot checks cover common and edge states.
- A Mock-backed example proves the component works inside a real list, form,
  dialog, drawer, or permission workflow.
- The component can be removed from the candidate adapter without breaking the
  active Arco adapter.

The first migration rehearsal should use one real business page, preferably
dictionary, user, or role management, because those pages cover table, search,
form, modal, permission button, empty state, and API error behavior.

## Migration Strategy

1. Keep current pages stable on Arco.
2. Build new enterprise pages through Pro components and `adminUi`.
3. Add `aheart-ui` to the candidate adapter only component by component.
4. Run a dual-adapter migration spike on one real business page.
5. Switch the active adapter only after tests and visual checks prove behavior
   parity.

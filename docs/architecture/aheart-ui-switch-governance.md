# aheart-ui Switch Governance

This document records `T-200A.5`: switch and rollback governance for adopting
`aheart-ui` in AF-Ideal-Admin. The current status is `Blocked`; Arco remains the
production default UI foundation until every gate below is satisfied.

## Inputs

- Maturity matrix: `docs/architecture/aheart-ui-maturity-matrix.md`
- Candidate adapter boundary: `src/components/pro-ui/adapters/aheart.ts`
- Mock-backed adapter lab: `src/views/examples/ui-adapter-lab/index.vue`
- First real-page rehearsal:
  `docs/architecture/aheart-ui-dict-migration-rehearsal.md`

## Component-level replacement rule

A single `aheart-ui` component may enter the candidate adapter only when:

- Its maturity matrix row is `Ready` for Type Contract, States, Theme, A11y,
  Docs, Unit Tests, Visual Check, and Mock Demo.
- The component is exposed only through `AdminUiAdapter` or a Pro component
  contract.
- The active Arco adapter keeps passing the same contract tests.
- The Mock-backed UI adapter lab proves the component inside at least one real
  list, form, dialog, drawer, permission, empty, or error workflow.
- A rollback owner and rollback command path are recorded before merge.

## Page-level gray replacement rule

A page may run a gray replacement rehearsal only when:

- All components used by that page have candidate adapter evidence.
- The page has Mock-backed tests for query, submit, permission, empty, and error
  states where applicable.
- The page has a rehearsal report like
  `docs/architecture/aheart-ui-dict-migration-rehearsal.md`.
- The gray path is scoped to one page and does not change the production default
  adapter.
- Visual and interaction differences are recorded before any decision to
  expand.

## Production default switch rule

The production default UI foundation may switch from Arco to `aheart-ui` only
when:

- Every required row in `docs/architecture/aheart-ui-maturity-matrix.md` is
  `Ready`.
- The Mock-backed adapter lab passes under both Arco and `aheart-ui`.
- At least one real system page passes the dual-adapter rehearsal with no open
  Blocked gaps.
- Full lint, typecheck, unit tests, production build, and e2e smoke pass.
- Rollback evidence is attached to the switch decision.

## Rollback trigger

Rollback is required when any of these conditions appears after a component,
page, or production-default switch:

- Unit, e2e, or build checks fail.
- Keyboard, focus, validation, empty, loading, permission, or error states
  regress.
- A visual check shows unacceptable layout, spacing, theme, or contrast drift.
- Mock-backed API behavior changes for the business page.
- The candidate adapter introduces runtime errors or page-blocking warnings.

The rollback action is to restore Arco as the active adapter, revert the
component or page-level replacement, re-run the affected tests, and keep the
candidate row `Blocked` until new evidence is attached.

## Owner and evidence

| Gate | Owner | Required Evidence |
| --- | --- | --- |
| Component candidate entry | UI platform owner | Matrix row, component docs, unit tests, visual check, Mock Demo |
| Page-level gray replacement | Page owner and UI platform owner | Page test output, rehearsal report, visual notes, rollback steps |
| Production default switch | Framework maintainer | Full CI output, e2e smoke, maturity matrix, rollback record |
| Rollback execution | Change owner | Revert commit, passing regression tests, updated decision record |

## Current Decision

Blocked. The project has a candidate adapter boundary, a Mock-backed adapter lab,
and one dictionary-page rehearsal, but `aheart-ui` is not yet a validated
production foundation. No component, page, or global switch may proceed until
the relevant evidence moves from `Blocked` or `Pending` to `Ready`.

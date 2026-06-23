# aheart-ui Dict Page Migration Rehearsal

This document records `T-200A.4`: the first real-page dual-adapter migration
rehearsal for AF-Ideal-Admin. The selected page is
`src/views/system/dictSystem/index.vue` because it covers table query, form
submit, permission actions, modal workflows, detail display, and Mock-backed
CRUD APIs.

## Rehearsal Scope

- Real page: `src/views/system/dictSystem/index.vue`
- API contract: `src/api/system/dictionary.ts`
- Mock contract: `src/mock/modules/system-dictionary.ts`
- Route and menu: `src/router/routes/modules/system.ts`
- Existing regression test: `tests/unit/system-dict-page.test.ts`

## Mock API Scenarios

- `GET /system/dictionaries`: list query with pagination and filters.
- `GET /system/dictionaries/:id`: detail drawer or modal data source.
- `POST /system/dictionaries`: create dictionary item.
- `PUT /system/dictionaries/:id`: update dictionary item.
- `DELETE /system/dictionaries/:id`: delete dictionary item after confirmation.
- `dictionaryService.getOptions('dictStatus')`: status option loading for
  `ProForm` select fields.

Permission scenarios use:

- `system:dict:list`
- `system:dict:create`
- `system:dict:update`
- `system:dict:delete`
- `system:dict:detail`

## Adapter Coverage

| Workflow | Current Coverage | Rehearsal Result |
| --- | --- | --- |
| List query | `ProTable` backed by active `adminUi.Table` | Covered by Arco adapter and page tests |
| Query form | `ProForm` backed by active form/input/select adapter | Covered by Arco adapter and page tests |
| Create/edit form | `ProForm` submitter and Mock API mutation | Covered by Arco adapter and page tests |
| Permission actions | `PermissionButton` with dictionary permission codes | Covered by page tests |
| Feedback | `adminUi.Message` | Covered by page tests |
| Modal workflows | migrated to `adminUi.Modal` | Covered by page tests |
| Detail display | direct `<a-descriptions>` and `<a-descriptions-item>` | Gap before `aheart-ui` candidate use |

## Parity Gaps

- `aheart-ui` is not installed as a validated package or workspace dependency,
  so the page cannot run against a real `aheart-ui` component implementation.
- The page still has direct Arco detail display usage through `<a-descriptions>`
  and `<a-descriptions-item>`.
- `AdminUiAdapter` does not yet expose Descriptions or DescriptionItem.
- `TableColumnData` remains a type import from Arco. It is compile-time only,
  but a future adapter-neutral ProTable column type should replace it.
- The maturity matrix keeps the relevant `aheart-ui` rows as `Blocked: Not
  ready`, so no component can graduate from candidate to production.

## Visual And Interaction Notes

The Arco-backed page path remains stable after moving modal workflows behind
`adminUi.Modal`. The expected `aheart-ui` visual and interaction differences
cannot be accepted yet because there is no validated candidate implementation.
The risk areas for the future rehearsal are modal sizing, form validation
messages, table pagination rendering, focus order, and detail display semantics.

## Rollback

Rollback is low risk because Arco remains the active adapter. If the modal
boundary causes a regression:

1. Restore the three modal workflows in `src/views/system/dictSystem/index.vue`
   from `adminUi.Modal` back to the previous Arco modal usage.
2. Keep `adminUi` as the production Arco adapter.
3. Re-run `tests/unit/system-dict-page.test.ts`.
4. Do not change the production default UI foundation.

The rollback owner should attach the reverted commit and the passing regression
test output to the switch decision record.

## Decision

Blocked. The dictionary page is a valid rehearsal target, and modal workflows
now exercise `adminUi.Modal`, but the page cannot graduate to `aheart-ui`
candidate use until:

- `aheart-ui` provides validated Button, Table, Form, Input, Select, Modal, and
  Message implementations behind `AdminUiAdapter`.
- Description display is either added to `AdminUiAdapter` or wrapped in a Pro
  detail component.
- The Mock-backed UI adapter lab and this real page pass the same behavior
  checks under both adapters.
- Rollback evidence is attached to the switch decision.

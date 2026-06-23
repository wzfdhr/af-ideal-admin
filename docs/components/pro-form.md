# ProForm

`ProForm` is the schema-driven form entry for enterprise business pages. It
centralizes default values, validation, submit loading, reset behavior, readonly
mode, submit errors, and async option loading.

## Minimal Usage

```vue
<template>
  <ProForm :schema="schema" :submitter="submit" />
</template>

<script setup lang="ts">
import ProForm from '@/components/pro-form/index.vue'
import type { ProFormField } from '@/components/pro-form/types'

const schema: ProFormField[] = [
  {
    field: 'name',
    label: 'Name',
    type: 'input',
    rules: [{ required: true, message: 'Name is required' }],
  },
]

const submit = async (values: Record<string, unknown>) => {
  await request.post('/users', values)
}
</script>
```

## Field Schema

Each field has a stable schema:

```ts
{
  field: 'status',
  label: 'Status',
  type: 'select',
  defaultValue: 'enabled',
  options: [{ label: 'Enabled', value: 'enabled' }],
  rules: [{ required: true, message: 'Status is required' }]
}
```

Supported initial field types:

- `input`
- `select`

The schema is intentionally small for the first enterprise boundary. New field
types should extend the schema contract instead of adding page-local form code.

## Async Options

Select fields may load options asynchronously:

```ts
{
  field: 'status',
  label: 'Status',
  type: 'select',
  loadOptions: () => dictionaryService.getOptions('status')
}
```

## Methods

Use a component ref for imperative workflows:

```ts
formRef.value?.submit()
formRef.value?.reset()
formRef.value?.setValues({ name: 'Alice' })
formRef.value?.getValues()
```

`submit` validates fields first. When validation passes, it toggles submit
loading while `submitter` is running and emits `submit` with the final values.
This gives business pages a shared submit loading and error lifecycle instead of
duplicating try/catch logic around every form.

## Submit Errors

If `submitter` rejects, `submit` returns `false`, clears submit loading, renders
the `submitErrorText` message, and emits `submitError` with the original error,
message, and submitted values:

```vue
<ProForm
  :schema="schema"
  submit-error-text="Save failed"
  :submitter="submit"
  @submit-error="handleSubmitError"
/>
```

Validation errors still use `submitFailed` so required-field failures and
transport or service failures stay separate.

## Readonly Mode

Set `readonly` on the form or on a single field. Readonly fields are disabled,
and form actions are hidden when the whole form is readonly.

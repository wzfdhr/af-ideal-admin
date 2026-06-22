# Dictionary Service And Components

Dictionary data is shared by tables, forms, filters, and detail displays through
`dictionaryService`.

## API Contract

Dictionary APIs return the standard response shape:

```ts
{
  code: 20000,
  msg: 'success',
  data: [
    { label: '启用', value: 'enabled' }
  ]
}
```

Known dictionary keys are mapped in `src/api/common.ts`. Unknown keys fall back
to `/sys/dic/:key`.

## Service Usage

```ts
import { dictionaryService } from '@/services/dictionary'

const options = await dictionaryService.getOptions('gender')
const state = dictionaryService.getState('gender')
```

The service caches successful remote requests by key. Static dictionaries can be
registered when creating an isolated service for tests or local-only options.

## Components

Use `DictSelect` and `DictRadio` for business forms and query filters:

```vue
<DictSelect v-model="form.gender" dict-key="gender" />
<DictRadio v-model="form.status" dict-key="status" />
```

Both components use the same `dictionaryService`, so table display and form
selection can share one dictionary source. When loading fails, the components
render an inline error and emit `loadError`.

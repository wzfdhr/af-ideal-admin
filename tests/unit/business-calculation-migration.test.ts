import { describe, it, expect } from 'vitest'
import { reactive } from 'vue'
import { migrateFormSchema } from '@/components/form-designer/schema'
import {
  EQUIPMENT_FORM,
  parseForm,
  computeBusinessFields,
  validateBusinessFields,
} from '@af-admin/contracts'

describe('business formula configuration migration', () => {
  it('preserves published calculations and numeric rules through the existing designer adapter', () => {
    const migrated = migrateFormSchema(
      reactive(structuredClone(EQUIPMENT_FORM))
    )
    expect(migrated.formConfig.computedFields).toEqual(
      EQUIPMENT_FORM.formConfig.computedFields
    )
    const parsed = parseForm(migrated)
    const fields = validateBusinessFields(parsed, {
      itemName: '设备',
      quantity: '7',
      unitPrice: '0.10',
      reason: '测试',
    })
    expect(computeBusinessFields(parsed, fields).totalAmount).toBe('0.70')
  })
})

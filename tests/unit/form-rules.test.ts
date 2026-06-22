import { describe, expect, it } from 'vitest'
import { parseWidgetRules } from '@/components/s-form/renderer/rules'

describe('parseWidgetRules', () => {
  it('returns undefined for empty input', () => {
    expect(parseWidgetRules()).toBeUndefined()
    expect(parseWidgetRules('')).toBeUndefined()
    expect(parseWidgetRules('   ')).toBeUndefined()
  })

  it('parses JSON rule arrays', () => {
    expect(
      parseWidgetRules('[{"required":true,"message":"请填写名称"}]')
    ).toEqual([{ required: true, message: '请填写名称' }])
  })

  it('rejects executable expressions', () => {
    expect(parseWidgetRules('window.alert(1)')).toBeUndefined()
    expect(parseWidgetRules('(() => true)()')).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import { adminUi } from '@/components/pro-ui'

describe('adminUi adapter', () => {
  it('exposes the current Arco implementation through a stable boundary', () => {
    expect(adminUi.name).toBe('arco')
    expect(adminUi.Button).toBeTruthy()
    expect(adminUi.Table).toBeTruthy()
    expect(adminUi.Form).toBeTruthy()
    expect(adminUi.FormItem).toBeTruthy()
    expect(adminUi.Input).toBeTruthy()
    expect(adminUi.Select).toBeTruthy()
    expect(adminUi.Modal).toBeTruthy()
    expect(adminUi.Drawer).toBeTruthy()
    expect(adminUi.Message.success).toEqual(expect.any(Function))
    expect(adminUi.Message.error).toEqual(expect.any(Function))
    expect(adminUi.Message.warning).toEqual(expect.any(Function))
  })
})

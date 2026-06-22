import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import permission from '@/directives/permission'
import useUserStore from '@/store/modules/user'
import type { DirectiveBinding } from 'vue'

const mountDirective = (value: unknown) => {
  const parent = document.createElement('div')
  const el = document.createElement('button')
  parent.appendChild(el)

  permission.mounted(el, {
    value,
  } as DirectiveBinding)

  return {
    el,
    parent,
  }
}

describe('permission directive', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps elements when the user owns the permission code', () => {
    const userStore = useUserStore()
    userStore.setInfo({
      role: 'user',
      permissions: ['user:create'],
    })

    const { el, parent } = mountDirective('user:create')

    expect(parent.contains(el)).toBe(true)
  })

  it('removes elements when the user misses the permission code', () => {
    const userStore = useUserStore()
    userStore.setInfo({
      role: 'user',
      permissions: ['user:update'],
    })

    const { el, parent } = mountDirective('user:create')

    expect(parent.contains(el)).toBe(false)
  })

  it('keeps legacy role arrays working', () => {
    const userStore = useUserStore()
    userStore.setInfo({
      role: 'admin',
    })

    const { el, parent } = mountDirective(['admin'])

    expect(parent.contains(el)).toBe(true)
  })

  it('allows empty requirements', () => {
    const { el, parent } = mountDirective([])

    expect(parent.contains(el)).toBe(true)
  })
})

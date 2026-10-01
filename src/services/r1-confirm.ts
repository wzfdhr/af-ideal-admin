import { Modal } from '@arco-design/web-vue'

let pending = false
/** Accessible confirmation using the existing UI library; no business commands run here. */
export const confirmR1Action = (content: string): Promise<boolean> => {
  if (pending) return Promise.resolve(false)
  pending = true
  const trigger =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined
  return new Promise((resolve) => {
    let dialog: HTMLElement | null = null
    let settled = false
    const buttons = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ||
          []
      )
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const controls = buttons()
      if (!controls.length) return
      const index = controls.indexOf(
        document.activeElement as HTMLButtonElement
      )
      event.preventDefault()
      controls[
        (index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length
      ].focus()
    }
    const finish = (accepted: boolean) => {
      if (settled) return
      settled = true
      pending = false
      resolve(accepted)
    }
    Modal.confirm({
      title: '确认操作',
      content,
      okText: '确认',
      cancelText: '取消',
      closable: false,
      maskClosable: false,
      escToClose: true,
      modalClass: 'r1-confirm-dialog',
      onOpen: () => {
        dialog = document.querySelector<HTMLElement>('.r1-confirm-dialog')
        dialog?.setAttribute('role', 'dialog')
        dialog?.setAttribute('aria-modal', 'true')
        dialog?.setAttribute('aria-label', '确认操作')
        dialog?.addEventListener('keydown', keydown)
        buttons()[0]?.focus()
      },
      onOk: () => finish(true),
      onCancel: () => finish(false),
      onClose: () => {
        dialog?.removeEventListener('keydown', keydown)
        finish(false)
        if (trigger?.isConnected && !trigger.matches(':disabled'))
          trigger.focus()
        else {
          const heading = document.querySelector<HTMLElement>('main h1')
          if (heading) {
            heading.tabIndex = -1
            heading.focus()
          }
        }
      },
    })
  })
}

export default confirmR1Action

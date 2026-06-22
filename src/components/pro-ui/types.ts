import type { Component } from 'vue'

export type AdminUiAdapterName = 'arco' | 'aheart'

export interface AdminUiAdapter {
  name: AdminUiAdapterName
  Button: Component
  Table: Component
  Form: Component
  FormItem: Component
  Input: Component
  Select: Component
  Modal: Component
  Drawer: Component
  Message: {
    success: (content: string) => void
    error: (content: string) => void
    warning: (content: string) => void
  }
}

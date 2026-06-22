import {
  Button,
  Drawer,
  Form,
  Input,
  Message,
  Modal,
  Radio,
  RadioGroup,
  Select,
  Table,
} from '@arco-design/web-vue'
import type { AdminUiAdapter } from '../types'

const arcoAdapter: AdminUiAdapter = {
  name: 'arco',
  Button,
  Table,
  Form,
  FormItem: Form.Item,
  Input,
  Select,
  RadioGroup,
  Radio,
  Modal,
  Drawer,
  Message: {
    success: (content) => Message.success(content),
    error: (content) => Message.error(content),
    warning: (content) => Message.warning(content),
  },
}

export default arcoAdapter

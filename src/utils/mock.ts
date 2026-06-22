import { mockFail, mockOk } from '@/mock/response'

const debug = import.meta.env.DEV

export default ({ mock, setup }: { mock?: boolean; setup: () => void }) => {
  if (mock !== false && debug) setup()
}

export const responseWrap = <T>(data: T) => mockOk(data)

export const failedResponseWrap = (data: unknown, msg: string, code = 500) => ({
  ...mockFail(msg, code, data),
})

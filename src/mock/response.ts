export interface MockResponse<T> {
  code: number
  msg: string
  data: T
}

export const mockOk = <T>(data: T, msg = 'success'): MockResponse<T> => ({
  code: 20000,
  msg,
  data,
})

export const mockFail = (
  msg: string,
  code = 50000,
  data: unknown = null
): MockResponse<unknown> => ({
  code,
  msg,
  data,
})

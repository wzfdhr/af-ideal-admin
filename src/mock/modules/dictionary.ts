import Mock from 'mockjs'
import setupMock, { responseWrap } from '@/utils/mock'
import { mockDictionaries } from '../seed'

const setupDictionaryMock = () => {
  setupMock({
    setup() {
      Object.entries(mockDictionaries).forEach(([key, options]) => {
        Mock.mock(new RegExp(`/api/sys/dic/${key}$`), () =>
          responseWrap(options)
        )
      })
    },
  })
}

export default setupDictionaryMock

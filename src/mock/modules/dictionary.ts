import Mock from 'mockjs'
import setupMock, { responseWrap } from '@/utils/mock'
import { mockDictionaries } from '../seed'

const setupDictionaryMock = () => {
  setupMock({
    setup() {
      Mock.mock(new RegExp('/api/sys/dic/gender'), () =>
        responseWrap(mockDictionaries.gender)
      )

      Mock.mock(new RegExp('/api/sys/dic/degree'), () =>
        responseWrap(mockDictionaries.degree)
      )

      Mock.mock(new RegExp('/api/sys/dic/diploma'), () =>
        responseWrap(mockDictionaries.diploma)
      )

      Mock.mock(new RegExp('/api/sys/dic/field'), () =>
        responseWrap(mockDictionaries.field)
      )
    },
  })
}

export default setupDictionaryMock

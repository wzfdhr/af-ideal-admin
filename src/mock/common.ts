import Mock from 'mockjs'
import setupMock, { responseWrap } from '@/utils/mock'

setupMock({
  setup() {
    Mock.mock(new RegExp('/api/sys/dic/gender'), () =>
      responseWrap([
        { label: '女', value: 0 },
        { label: '男', value: 1 },
      ])
    )

    Mock.mock(new RegExp('/api/sys/dic/degree'), () =>
      responseWrap([
        { value: 0, label: '高中及以下' },
        { value: 1, label: '大学专科' },
        { value: 2, label: '大学本科' },
        { value: 4, label: '硕士研究生' },
        { value: 5, label: '博士研究生' },
      ])
    )

    Mock.mock(new RegExp('/api/sys/dic/diploma'), () =>
      responseWrap([
        { value: 0, label: '无' },
        { value: 1, label: '学士' },
        { value: 2, label: '硕士' },
        { value: 4, label: '博士' },
      ])
    )

    Mock.mock(new RegExp('/api/sys/dic/field'), () =>
      responseWrap([
        { value: 0, label: '计算机科学' },
        { value: 1, label: '软件工程' },
        { value: 2, label: '人工智能' },
        { value: 4, label: '通信工程' },
      ])
    )
  },
})

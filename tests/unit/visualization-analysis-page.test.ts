import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AnalysisPage from '@/views/visualization/analysis/index.vue'
import MultidimensionalAnalysisPage from '@/views/visualization/multidimensionalAnalysis/index.vue'

describe('visualization analysis pages', () => {
  it('renders analysis page metrics, trends and content distribution', () => {
    const wrapper = mount(AnalysisPage, {
      global: {
        stubs: {
          ATag: true,
          SNavs: true,
        },
      },
    })

    expect(wrapper.find('[data-testid="visual-analysis-page"]').exists()).toBe(
      true
    )
    ;[
      '舆情分析',
      '内容发布比例',
      'Mock 数据周期',
      '总声量',
      '正向情绪',
      '传播渠道',
      '热点主题',
      '风险预警',
    ].forEach((text) => {
      expect(wrapper.text()).toContain(text)
    })
  })

  it('renders multidimensional analysis with dimension matrix and drilldown data', () => {
    const wrapper = mount(MultidimensionalAnalysisPage, {
      global: {
        stubs: {
          SNavs: true,
        },
      },
    })

    expect(
      wrapper.find('[data-testid="multidimensional-analysis-page"]').exists()
    ).toBe(true)
    ;[
      '多维数据分析',
      '维度矩阵',
      '区域',
      '渠道',
      '产品线',
      '转化率',
      '下钻路径',
      'Mock 明细样本',
    ].forEach((text) => {
      expect(wrapper.text()).toContain(text)
    })
  })
})

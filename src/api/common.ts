import request from './request'
import type { SelectOptionData } from '@arco-design/web-vue/es/select'

export const getGenderOptions = async () =>
  request.get<SelectOptionData[]>('/sys/dic/gender')
export const getDegreeOptions = async () =>
  request.get<SelectOptionData[]>('/sys/dic/degree')
export const getDiplomaOptions = async () =>
  request.get<SelectOptionData[]>('/sys/dic/diploma')
export const getFieldOptions = async () =>
  request.get<SelectOptionData[]>('/sys/dic/field')

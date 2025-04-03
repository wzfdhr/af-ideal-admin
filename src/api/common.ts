import axios from 'axios'
import type { SelectOptionData } from '@arco-design/web-vue/es/select'

export const getGenderOptions = async () =>
  axios.get<SelectOptionData[]>('/api/sys/dic/gender')
export const getDegreeOptions = async () =>
  axios.get<SelectOptionData[]>('/api/sys/dic/degree')
export const getDiplomaOptions = async () =>
  axios.get<SelectOptionData[]>('/api/sys/dic/diploma')
export const getFieldOptions = async () =>
  axios.get<SelectOptionData[]>('/api/sys/dic/field')

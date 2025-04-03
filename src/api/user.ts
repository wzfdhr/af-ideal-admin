import axios from 'axios'
import type { UserState } from '@/store/modules/user'
import type { RouteRecordNormalized } from 'vue-router'

export interface LoginData {
  username: string
  password: string
}

export interface LoginRes {
  token: string
}

export const login = (data: LoginData) =>
  axios.post<LoginRes>('/api/user/login', data)
export const getUserInfo = () => axios.post<UserState>('/api/user/info')
export const getMenu = () =>
  axios.post<RouteRecordNormalized[]>('/api/user/menu')
export const logout = () => axios.post('/api/user/logout')

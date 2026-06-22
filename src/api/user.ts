import type { UserState } from '@/store/modules/user'
import request from './request'
import type { RouteRecordNormalized } from 'vue-router'

export interface LoginData {
  username: string
  password: string
}

export interface LoginRes {
  token: string
}

export const login = (data: LoginData) =>
  request.post<LoginRes>('/user/login', data)
export const getUserInfo = () => request.post<UserState>('/user/info')
export const getMenu = () => request.post<RouteRecordNormalized[]>('/user/menu')
export const logout = () => request.post('/user/logout')

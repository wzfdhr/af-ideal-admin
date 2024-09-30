import axios from 'axios'
import type { UserState } from '@/store/modules/user'

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
export const getCode = () => axios.get('/api/user/code')
export const getMenu = () => axios.get('api/user/code')
export const logout = () => axios.post('/api/user/logout')

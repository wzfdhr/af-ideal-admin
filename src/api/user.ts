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
  axios.post<LoginRes>('/user/login', data)
export const getUserInfo = () => axios.post<UserState>('/user/info')
export const getCode = () => axios.get('/user/code')
export const getMenu = () => axios.get('api/user/code')
export const logout = () => axios.post('/user/logout')

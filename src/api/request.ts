import axios from 'axios'
import { Message } from '@arco-design/web-vue'
import { getToken, clearToken } from '@/utils/auth'
import { requestBaseUrl, HTTPResponse } from '@config'
import type { AxiosResponse } from 'axios'

if (requestBaseUrl) {
  axios.defaults.baseURL = requestBaseUrl
}

axios.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token) {
      if (!config.headers) {
        config.headers = {}
      }
      config.headers['X-Access-Token'] = token
    }

    return config
  },
  (error) => Promise.reject(error)
)

axios.interceptors.response.use(
  (response: AxiosResponse<HTTPResponse>) => {
    const res = response.data
    if (res.code === 402) {
      clearToken()
      Message.error({
        content: '登录已过期,请重新登录',
        duration: 500,
      })
    }
    if (res.code !== 200) {
      Message.error({
        content: res.msg || 'Error',
        duration: 500,
      })
      console.error('请求错误', res)
      return Promise.reject(new Error(res.msg || '未命名的错误'))
    }

    return res
  },
  (error) => {
    Message.error({
      content: error.msg || 'Request Error',
      duration: 500,
    })
    console.error('请求错误', error)
    return Promise.reject(error)
  }
)

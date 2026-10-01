const TOKEN_KEY = 'token'
const ROLE_KEY = 'userRole'
const USER_ID_KEY = 'userId'

export const getUserId = () => localStorage.getItem(USER_ID_KEY)

export const setUserId = (id: string) => {
  localStorage.setItem(USER_ID_KEY, id)
}

export const isAuthed = () => !!localStorage.getItem(TOKEN_KEY)

export const getToken = () => localStorage.getItem(TOKEN_KEY)

export const setToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token)
}

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY)
}

export const getRole = () => localStorage.getItem(ROLE_KEY)

export const setRole = (role: string) => {
  localStorage.setItem(ROLE_KEY, role)
}

export const clearCurrentUser = () => {
  localStorage.removeItem(ROLE_KEY)
  localStorage.removeItem(USER_ID_KEY)
}

export const clearAuth = () => {
  clearToken()
  clearCurrentUser()
}

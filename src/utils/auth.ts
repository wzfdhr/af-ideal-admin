const TOKEN_KEY = 'token'
const ROLE_KEY = 'userRole'

const isAuthed = () => !!localStorage.getItem(TOKEN_KEY)

const getToken = () => localStorage.getItem(TOKEN_KEY)

const setToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token)
}

const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY)
}

const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ROLE_KEY)
}

export { isAuthed, getToken, setToken, clearToken, clearAuth }

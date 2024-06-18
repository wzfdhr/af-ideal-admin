const isAuthed = () => !!localStorage.getItem('token')

const getToken = () => localStorage.getItem('token')

const setToken = (token: string) => {
  localStorage.setItem('token', token)
}

const clearToken = () => {
  localStorage.removeItem('token')
}

export { isAuthed, getToken, setToken, clearToken }

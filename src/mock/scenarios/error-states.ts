const errorStateScenarios = {
  unauthorized: {
    code: 50008,
    msg: '未登录',
  },
  forbidden: {
    code: 403,
    msg: '没有访问权限',
  },
  serverError: {
    code: 500,
    msg: '服务异常，请稍后重试',
  },
  empty: {
    code: 20000,
    msg: 'success',
    data: [],
  },
}

export default errorStateScenarios

/**
 * 获取浏览器版本信息
 * @returns {number|string}
 */
const getBrowserVersionInfo = () => {
  const { userAgent } = navigator // 取得浏览器的userAgent字符串
  const isIE =
    userAgent.indexOf('compatible') > -1 && userAgent.indexOf('MSIE') > -1 // 判断是否IE<11浏览器
  const isIE11 =
    userAgent.indexOf('Trident') > -1 && userAgent.indexOf('rv:11.0') > -1
  const isEdge = userAgent.indexOf('Edge') > -1 && !isIE // Edge浏览器
  const isFirefox = userAgent.indexOf('Firefox') > -1 // Firefox浏览器
  const isOpera =
    userAgent.indexOf('Opera') > -1 || userAgent.indexOf('OPR') > -1 // Opera浏览器
  const isChrome =
    userAgent.indexOf('Chrome') > -1 &&
    userAgent.indexOf('Safari') > -1 &&
    userAgent.indexOf('Edge') === -1 &&
    userAgent.indexOf('OPR') === -1 // Chrome浏览器
  const isSafari =
    userAgent.indexOf('Safari') > -1 &&
    userAgent.indexOf('Chrome') === -1 &&
    userAgent.indexOf('Edge') === -1 &&
    userAgent.indexOf('OPR') === -1 // Safari浏览器
  if (isIE) {
    const reIE = new RegExp('MSIE (\\d+\\.\\d+);')
    reIE.test(userAgent)
    const fIEVersion = parseFloat(RegExp.$1)
    if (fIEVersion === 7) {
      return 'IE:7'
    }
    if (fIEVersion === 8) {
      return 'IE:8'
    }
    if (fIEVersion === 9) {
      return 'IE:9'
    }
    if (fIEVersion === 10) {
      return 'IE:10'
    }
    return 'IE:6' // IE版本<7
  }
  if (isIE11) {
    return 'IE:11'
  }
  if (isEdge) {
    return `Edge:${userAgent.split('Edge/')[1].split('.')[0]}`
  }
  if (isFirefox) {
    return `Firefox:${userAgent.split('Firefox/')[1].split('.')[0]}`
  }
  if (isOpera) {
    return `Opera:${userAgent.split('OPR/')[1].split('.')[0]}`
  }
  if (isChrome) {
    return `Chrome:${userAgent.split('Chrome/')[1].split('.')[0]}`
  }
  if (isSafari) {
    return `Safari:${userAgent.split('Safari/')[1].split('.')[0]}`
  }
  return -1 // 不是ie浏览器
}
const isOutDated = (limitObj: any) => {
  if (limitObj === undefined) {
    limitObj = {
      Edge: 12,
      Firefox: 110,
      Chrome: 103,
    }
  }
  // console.log(navigator.userAgent);
  const browserVersionStr = navigator.userAgent.split(':')
  const name = browserVersionStr[0]
  const version = browserVersionStr[1]
  console.log(browserVersionStr, name, version)
  return !limitObj[name] || (limitObj[name] && version < limitObj[name])
}

export { getBrowserVersionInfo, isOutDated }

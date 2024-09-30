/* 用于加密密码的工具方法。此处返回原密码，在生产环境下应当使用实际
 * 约定的加密方法进行加密处理
 */
import CryptoJS from 'crypto-js'

const key = '1231231231231231'
// 加密
export const encrypt = (data: string) => {
  // const key = CryptoJS.enc.Utf8.parse(secretKey)
  const encrypted = CryptoJS.AES.encrypt(data, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return encrypted.toString()
}

// 解密
export const decrypt = (encryptedData: string) => {
  // const key = CryptoJS.enc.Utf8.parse(secretKey)
  const decrypted = CryptoJS.AES.decrypt(encryptedData, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return decrypted.toString(CryptoJS.enc.Utf8)
}

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })

export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex')
export const newToken = () => randomBytes(32).toString('base64url')
export const hashPassword = async (password: string) => {
  const salt = randomBytes(16).toString('base64url')
  return `scrypt:v1:${salt}:${(await derive(password, salt)).toString(
    'base64url'
  )}`
}
export const verifyPassword = async (password: string, stored: string) => {
  const [algorithm, version, salt, encoded] = stored.split(':')
  if (algorithm !== 'scrypt' || version !== 'v1' || !salt || !encoded)
    return false
  const expected = Buffer.from(encoded, 'base64url')
  const actual = await derive(password, salt)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

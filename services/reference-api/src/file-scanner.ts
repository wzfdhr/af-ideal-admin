import net from 'node:net'

export interface ScanResult {
  clean: boolean
  engine: string
  threat?: string
}
export type VirusScanner = (bytes: Buffer) => Promise<ScanResult>
const exchange = (
  host: string,
  port: number,
  payload: Buffer
): Promise<string> =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port })
    const parts: Buffer[] = []
    socket.setTimeout(15000, () => socket.destroy(new Error('Scanner timeout')))
    socket.once('connect', () => socket.write(payload))
    socket.on('data', (chunk) => {
      parts.push(chunk)
      if (Buffer.concat(parts).length > 8192)
        socket.destroy(new Error('Scanner reply too large'))
    })
    socket.once('error', reject)
    socket.once('end', () =>
      resolve(Buffer.concat(parts).toString('utf8').replace(/\0/g, ''))
    )
  })
export const clamavScanner =
  (host: string, port: number): VirusScanner =>
  async (bytes) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(bytes.length)
    const response = await exchange(
      host,
      port,
      Buffer.concat([
        Buffer.from('zINSTREAM\0'),
        length,
        bytes,
        Buffer.alloc(4),
      ])
    )
    const engine = (
      await exchange(host, port, Buffer.from('zVERSION\0'))
    ).trim()
    if (!engine.startsWith('ClamAV '))
      throw new Error('Scanner version invalid')
    if (response.trim() === 'stream: OK') return { clean: true, engine }
    if (response.endsWith(' FOUND'))
      return {
        clean: false,
        engine,
        threat: response.slice(8, -6).slice(0, 120),
      }
    throw new Error('Scanner failed')
  }

export const createCommandRetry = () => {
  const commands = new Map<string, { signature: string; key: string }>()
  return {
    key(operation: string, payload: unknown) {
      const signature = JSON.stringify(payload)
      const previous = commands.get(operation)
      if (previous?.signature === signature) return previous.key
      const key = crypto.randomUUID()
      commands.set(operation, { signature, key })
      return key
    },
    complete(operation: string) {
      commands.delete(operation)
    },
    clear() {
      commands.clear()
    },
  }
}

export default createCommandRetry

export const resolveDataMode = (
  isDevelopment: boolean,
  selectedMode?: string
): 'mock' | 'reference' => {
  if (!isDevelopment) return 'reference'
  if (
    selectedMode === undefined ||
    selectedMode === '' ||
    selectedMode === 'mock'
  ) {
    return 'mock'
  }
  if (selectedMode === 'reference') return 'reference'
  throw new Error('Unsupported VITE_DATA_MODE')
}

export const dataMode = resolveDataMode(
  import.meta.env.DEV,
  import.meta.env.VITE_DATA_MODE
)

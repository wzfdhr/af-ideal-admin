export interface RuntimeConfig {
  API_BASE_URL: string
  APP_TITLE: string
}

export interface RuntimeConfigGlobal {
  AF_IDEAL_ADMIN_CONFIG?: Partial<RuntimeConfig>
}

export interface RuntimeConfigEnv {
  VITE_API_BASE_URL?: string
  VITE_APP_TITLE?: string
}

export const resolveRuntimeValue = (
  runtimeValue: unknown,
  fallback: string
) => {
  if (typeof runtimeValue !== 'string') {
    return fallback
  }

  const value = runtimeValue.trim()
  return value || fallback
}

export const getRuntimeConfig = (
  runtimeGlobal: RuntimeConfigGlobal = globalThis as RuntimeConfigGlobal,
  env: RuntimeConfigEnv = import.meta.env as unknown as RuntimeConfigEnv
): RuntimeConfig => {
  const runtimeConfig = runtimeGlobal.AF_IDEAL_ADMIN_CONFIG || {}

  return {
    API_BASE_URL: resolveRuntimeValue(
      runtimeConfig.API_BASE_URL,
      env.VITE_API_BASE_URL || ''
    ),
    APP_TITLE: resolveRuntimeValue(
      runtimeConfig.APP_TITLE,
      env.VITE_APP_TITLE || 'AF-Ideal-Admin'
    ),
  }
}

export const runtimeConfig = getRuntimeConfig()

import * as path from 'path'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import eslint from 'vite-plugin-eslint'

const createManualChunks = (id: string) => {
  if (!id.includes('node_modules')) {
    return undefined
  }

  if (id.includes('@arco-design')) {
    return 'arco-vendor'
  }

  if (
    id.includes('echarts') ||
    id.includes('zrender') ||
    id.includes('vue-echarts')
  ) {
    return 'chart-vendor'
  }

  if (id.includes('@antv/x6')) {
    return 'x6-vendor'
  }

  if (
    id.includes('/vue/') ||
    id.includes('vue-router') ||
    id.includes('vue-i18n') ||
    id.includes('pinia') ||
    id.includes('@vueuse')
  ) {
    return 'vue-vendor'
  }

  if (
    id.includes('axios') ||
    id.includes('crypto-js') ||
    id.includes('dayjs') ||
    id.includes('lodash') ||
    id.includes('mitt') ||
    id.includes('mockjs') ||
    id.includes('nprogress') ||
    id.includes('query-string') ||
    id.includes('sortablejs') ||
    id.includes('vuedraggable')
  ) {
    return 'utility-vendor'
  }

  return 'vendor'
}

export default defineConfig(({ command, mode }) => {
  const rootDir = __dirname
  const env = loadEnv(mode, rootDir, '')
  const apiBaseUrl = env.VITE_API_BASE_URL || '/api'
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:10888'
  const isServe = command === 'serve'

  return {
    base: env.VITE_BASE_URL || '/',
    plugins: [
      vue(),
      vueJsx(),
      eslint({
        cache: false,
        cwd: rootDir,
        overrideConfigFile: path.resolve(rootDir, './.eslintrc.js'),
        useEslintrc: false,
        include: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.vue'],
        exclude: ['node_modules'],
      }),
    ],
    build: {
      rollupOptions: {
        external: '@antv/x6-plugin-dnd',
        output: {
          manualChunks: createManualChunks,
        },
      },
    },
    resolve: {
      alias: [
        {
          find: 'vue',
          replacement: 'vue/dist/vue.esm-bundler.js',
        },
        {
          find: '@',
          replacement: path.resolve(__dirname, './src'),
        },
        {
          find: '@config',
          replacement: path.resolve(__dirname, './config/index.ts'),
        },
      ],
      extensions: ['.ts', '.js'],
    },
    server: isServe
      ? {
          proxy: {
            [apiBaseUrl]: {
              target: apiProxyTarget,
              changeOrigin: true,
            },
          },
          cors: true,
        }
      : undefined,
  }
})

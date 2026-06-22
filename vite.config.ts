import * as path from 'path'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import eslint from 'vite-plugin-eslint'

export default defineConfig(({ mode }) => {
  const rootDir = __dirname
  const env = loadEnv(mode, rootDir, '')
  const apiBaseUrl = env.VITE_API_BASE_URL || '/api'
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:10888'

  return {
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
    server: {
      proxy: {
        [apiBaseUrl]: {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
      cors: true,
    },
  }
})

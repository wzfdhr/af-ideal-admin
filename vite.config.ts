import * as path from 'path'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import eslint from 'vite-plugin-eslint'

export default defineConfig(({ mode }) => {
  console.log(mode)
  const { VITE_BASE_URL, VITE_BOOT_URL } = loadEnv(mode, process.cwd())
  return {
    base: VITE_BASE_URL,
    plugins: [
      vue(),
      vueJsx(),
      eslint({
        cache: false,
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
          replacement: 'vue/dist/vue.esm-bundler.js', // compile template
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
        '/api': {
          target: VITE_BOOT_URL,
          changeOrigin: true,
          rewrite: (pathRewrite) => pathRewrite.replace(/^\/api/, '/af/'),
        },
      },
      cors: true,
    },
  }
})

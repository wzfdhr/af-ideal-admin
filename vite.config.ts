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
        '/mock': {
          // 你可以选择一个不与现有路径冲突的新路径
          target: 'http://localhost:5173', // Mock 服务的地址，这里假设你在本地运行 Mock 服务
          changeOrigin: true, // 如果需要，设置为 true 以允许跨域请求
          // 通常情况下，你可能不需要重写路径，因为 Mock 服务会处理特定的路径
          // 但如果你需要，也可以添加 rewrite 配置
        },
      },
      cors: true,
    },
  }
})

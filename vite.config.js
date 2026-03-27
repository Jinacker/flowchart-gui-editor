import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  define: {
    'process.env.NODE_ENV': '"production"',
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.js'),
      name: 'MermaidFlowEditor',
      formats: ['iife'],
    },
    rollupOptions: {
      external: [],
      output: {
        name: 'MermaidFlowEditor',
        entryFileNames: 'mermaid-flow-editor.iife.js',
        assetFileNames: 'mermaid-flow-editor.css',
        // IIFE 번들 최상단에 process 폴리필 주입 (Vue3/VueFlow가 process 참조)
        intro: 'var process={"env":{"NODE_ENV":"production"}};',
      },
    },
    outDir: resolve(__dirname, '../Acst/src/main/resources/static/lib/mermaid-flow-editor'),
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: true,
  },
})

import fs from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'background.html'),
        uninstall: resolve(__dirname, 'uninstall.html'),
      },
    },
  },
  plugins: [react(), tailwindcss(), {
    name: 'exclude-cdn-game-images',
    apply: 'build',
    closeBundle() {
      const output = resolve(__dirname, 'dist/game-data')
      for (const folder of ['icons']) {
        const directory = resolve(output, folder)
        if (!directory.startsWith(`${output}/`) && !directory.startsWith(`${output}\\`)) throw new Error('Invalid CDN staging path')
        fs.rmSync(directory, { recursive: true, force: true })
      }
    },
  }],
})


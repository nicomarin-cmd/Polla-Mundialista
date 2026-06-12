import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import type { Plugin } from 'vite'

// Stub para `gemini` — RainbowKit 2.x lo importa de wagmi/connectors pero fue eliminado en wagmi 3.x
function stubGeminiConnector(): Plugin {
  const filter = /wagmi[/\\]dist[/\\].*connectors/
  return {
    name: 'stub-gemini-connector',
    // Rollup (build de producción)
    transform(code, id) {
      if (!filter.test(id)) return null
      if (code.includes('export const gemini')) return null
      return { code: code + '\nexport const gemini = undefined;', map: null }
    },
  }
}

export default defineConfig({
  plugins: [react(), stubGeminiConnector()],
  optimizeDeps: {
    esbuildOptions: {
      plugins: [
        {
          // esbuild (dev server pre-bundling)
          name: 'stub-gemini-esbuild',
          setup(build) {
            build.onLoad({ filter: /wagmi[/\\]dist[/\\].*connectors\.js$/ }, (args) => {
              const contents = fs.readFileSync(args.path, 'utf-8')
              return {
                contents: contents.includes('export const gemini')
                  ? contents
                  : contents + '\nexport const gemini = undefined;',
                loader: 'js',
              }
            })
          },
        },
      ],
    },
  },
})

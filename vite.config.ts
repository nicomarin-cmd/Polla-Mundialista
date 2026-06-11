import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// RainbowKit 2.x references 'gemini' from wagmi/connectors, que fue eliminado en wagmi 3.x
// Agregamos un stub para que el build no falle (geminiWallet no se usa en la app)
const stubGeminiConnector: Plugin = {
  name: 'stub-gemini-connector',
  transform(code, id) {
    if (/wagmi[/\\].*connectors/i.test(id) && !code.includes('export const gemini')) {
      return { code: code + '\nexport const gemini = undefined;', map: null }
    }
  },
}

export default defineConfig({
  plugins: [react(), stubGeminiConnector],
})

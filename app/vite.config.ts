import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Lets the dev server read files from the project root, e.g. testdata/ for manual testing.
  server: { fs: { allow: [".."] } },
})

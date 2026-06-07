import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/Voice2prompt/',
  plugins: [react()],
  build: {
    target: 'es2020'
  }
});

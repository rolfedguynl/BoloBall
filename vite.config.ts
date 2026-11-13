import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from a GitHub Pages sub-path
  // (https://<user>.github.io/BoloBall/) as well as from any other folder.
  base: './',
  server: {
    watch: {
      // Visual Studio keeps files in .vs locked, which crashes Vite's watcher.
      ignored: ['**/.vs/**'],
    },
  },
});

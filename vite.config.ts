import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// Unique per build. The bundle gets it as __BUILD_ID__ and dist/version.json
// holds the deployed one, so an old cached page can notice it is out of date.
const BUILD_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

function versionFile(): Plugin {
  return {
    name: 'boloball-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ build: BUILD_ID })}\n`,
      });
    },
  };
}

export default defineConfig({
  // Relative asset paths so the build works from a GitHub Pages sub-path
  // (https://<user>.github.io/BoloBall/) as well as from any other folder.
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [versionFile()],
  server: {
    watch: {
      // Visual Studio keeps files in .vs locked, which crashes Vite's watcher.
      ignored: ['**/.vs/**'],
    },
  },
});

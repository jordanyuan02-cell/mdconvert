import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// process.env is a Node.js global injected at build time by Vite
const host = (process as unknown as { env: Record<string, string | undefined> }).env.TAURI_DEV_HOST;

/**
 * Custom Vite plugin to fix Tauri v2 production build compatibility:
 *
 * 1. Removes `crossorigin` from <link> and <script> tags — Tauri v2's custom
 *    protocol (https://tauri.localhost/) does not return CORS headers, and the
 *    `crossorigin` attribute causes the browser to expect them.
 *
 * 2. Moves CSS <link> before <script> tags — ensures the stylesheet is loaded
 *    and the CSSOM is built before JavaScript executes, preventing race
 *    conditions where KaTeX-rendered HTML elements (using display: inline-table
 *    / table-cell) are inserted before the CSS rules are available.
 */
function fixTauriHtml(): Plugin {
  return {
    name: 'fix-tauri-html',
    enforce: 'post',
    transformIndexHtml(html) {
      // 1. Remove `crossorigin` from all tags
      let result = html.replace(/\s+crossorigin(=["\'][^"\']*["\'])?/g, '');
      // 2. Move CSS <link> before any <script> tags — ensures CSSOM is built
      //    before JavaScript executes (critical for KaTeX layout rules).
      result = result.replace(
        /(<script[^>]*><\/script>)\s*(<link[^>]+rel=["']stylesheet["'][^>]*\/?>)/gi,
        '$2\n    $1'
      );
      return result;
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), fixTauriHtml()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'html-inject-env',
        transformIndexHtml(html) {
          // More robust injection that handles various cases
          const scriptTag = `<script>
            window.GEMINI_API_KEY = "${env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''}";
            if (!window.process) {
              window.process = { env: {} };
            }
            if (!window.process.env) {
              window.process.env = {};
            }
            window.process.env.GEMINI_API_KEY = "${env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''}";
          </script>`;
          
          // Replace existing script or append if not found
          const existingScriptRegex = /<script>\s*window\.process \= \{ env\: \{.*?\} \};\s*<\/script>/g;
          if (existingScriptRegex.test(html)) {
            return html.replace(existingScriptRegex, scriptTag);
          }
          
          // Append the script tag at the end of head section
          return html.replace(/<\/head>/, `${scriptTag}\n</head>`);
        }
      }
    ],
    define: {
      'process.env.IS_VITE': JSON.stringify('true')
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      sourcemap: false, // Отключаем генерацию sourcemaps для колоссальной экономии памяти во время сборки
      minify: 'esbuild', // Esbuild работает намного быстрее и потребляет значительно меньше RAM, чем Terser
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        maxParallelFileOps: 2, // Ограничиваем параллельный ввод-вывод, чтобы избежать всплесков потребления памяти
        output: {
          manualChunks(id) {
            // Дробим сторонние зависимости на меньшие куски. 
            // Это предотвращает удержание в RAM одного огромного AST-дерева в Rollup.
            if (id.includes('node_modules')) {
              if (id.includes('mermaid')) {
                return 'vendor-mermaid';
              }
              if (id.includes('d3') || id.includes('recharts')) {
                return 'vendor-charts';
              }
              if (id.includes('motion')) {
                return 'vendor-motion';
              }
              if (id.includes('react')) {
                return 'vendor-react';
              }
              return 'vendor-core';
            }
          }
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});

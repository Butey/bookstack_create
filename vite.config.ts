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
      minify: false, // Полностью отключаем минификацию (esbuild/terser) - это экономит максимум RAM и CPU на слабых VPS
      target: 'esnext', // Отключаем транспиляцию в старые версии JS, что также экономит ресурсы
      cssCodeSplit: false, // Отключаем разделение CSS: сборка одного файла требует гораздо меньше RAM/CPU, чем вычисление множества мелких чанков
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        treeshake: false, // Отключение treeshaking радикально снижает потребление RAM и CPU при сборке (Rollup не будет анализировать AST на мертвый код)
        maxParallelFileOps: 1, // Строго один файл за раз, чтобы минимизировать нагрузку на CPU/RAM на 1 vCPU серверах
        cache: false, // Отключаем кэш Rollup, чтобы предотвратить раздувание Node.js Heap-памяти во время сборки
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});

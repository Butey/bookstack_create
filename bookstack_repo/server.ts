import express from 'express';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import multer from 'multer';

import fs from 'fs';

dotenv.config();

console.log('GEMINI_API_KEY present:', !!process.env.GEMINI_API_KEY);

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', environment: process.env.NODE_ENV || 'development', key: process.env.GEMINI_API_KEY });
  });

  app.get('/api/gemini-key', (req, res) => {
    res.json({ key: process.env.GEMINI_API_KEY || '' });
  });

  app.get('/api/config', (req, res) => {
    res.json({
      hasEnvCredentials: !!(process.env.BOOKSTACK_BASE_URL && process.env.BOOKSTACK_TOKEN_ID && process.env.BOOKSTACK_TOKEN_SECRET),
      envBaseUrl: process.env.BOOKSTACK_BASE_URL || ''
    });
  });

  app.get('/api/settings', (req, res) => {
    try {
      const settingsPath = path.join(process.cwd(), 'settings.json');
      if (fs.existsSync(settingsPath)) {
        res.json(JSON.parse(fs.readFileSync(settingsPath, 'utf8')));
      } else {
        res.json({});
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/settings', (req, res) => {
    try {
      const settingsPath = path.join(process.cwd(), 'settings.json');
      let current = {};
      if (fs.existsSync(settingsPath)) {
        current = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }
      const updated = { ...current, ...req.body };
      fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2), 'utf8');
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/process-source', (req, res, next) => {
    console.log(`[API] Received POST request to /api/process-source. Headers:`, JSON.stringify(req.headers));
    upload.single('file')(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        return res.status(400).json({ error: `Ошибка загрузки файла: ${err.message}` });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      const file = req.file;
      const text = req.body.text || '';
      
      if (file) {
        console.log(`[File Received] Name: ${file.originalname}, Size: ${file.size}, Mime: ${file.mimetype}`);
        // Handle Cyrillic filenames
        let name = file.originalname;
        try {
          name = Buffer.from(file.originalname, 'latin1').toString('utf8');
        } catch (e) {
          name = file.originalname;
        }

        return res.json({ 
          base64: file.buffer.toString('base64'), 
          mimeType: file.mimetype,
          name: name 
        });
      }
      
      if (!text) return res.status(400).json({ error: 'Не предоставлен контент' });

      res.json({ content: text, name: 'Ручной ввод' });
    } catch (error: any) {
      console.error('Ошибка обработки запроса:', error);
      res.status(500).json({ error: `Ошибка сервера: ${error.message}` });
    }
  });


  // API Middleware for BookStack
  app.post('/api/bookstack/proxy', async (req, res) => {
    const { method, url, data, credentials } = req.body;

    const baseUrl = (process.env.BOOKSTACK_BASE_URL || credentials?.baseUrl)?.trim();
    const tokenId = (process.env.BOOKSTACK_TOKEN_ID || credentials?.tokenId)?.trim();
    const tokenSecret = (process.env.BOOKSTACK_TOKEN_SECRET || credentials?.tokenSecret)?.trim();

    if (!baseUrl || !tokenId || !tokenSecret) {
      return res.status(400).json({ error: 'Missing BookStack credentials. Please check settings.' });
    }

    try {
      const response = await axios({
        method,
        url: `${baseUrl.replace(/\/$/, '')}${url}`,
        headers: {
          'Authorization': `Token ${tokenId}:${tokenSecret}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        data
      });

      res.status(response.status).json(response.data);
    } catch (error: any) {
      const errorData = error.response?.data || { message: error.message };
      console.error(`[BookStack Error] ${method} ${url}:`, JSON.stringify(errorData, null, 2));
      
      // Handle specific BookStack error structures
      let errorMessage = 'An error occurred with BookStack API';
      if (errorData.error?.message) errorMessage = errorData.error.message;
      else if (errorData.message) errorMessage = errorData.message;
      
      res.status(error.response?.status || 500).json({ 
        error: errorMessage,
        details: errorData 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // If the server was bundled into dist/server.js, __dirname will be the dist directory.
    // If running with tsx in dev, we shouldn't hit this branch anyway.
    const distPath = __dirname;
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const htmlPath = path.join(distPath, 'index.html');
      if (fs.existsSync(htmlPath)) {
        let html = fs.readFileSync(htmlPath, 'utf8');
        const apiKey = process.env.GEMINI_API_KEY || '';
        const injectedCode = `<script>
          window.GEMINI_API_KEY = "${apiKey}";
          if (!window.process) { window.process = { env: {} }; }
          if (!window.process.env) { window.process.env = {}; }
          window.process.env.GEMINI_API_KEY = "${apiKey}";
        </script>`;
        // Remove any existing env injection scripts inserted at build time, then inject fresh
        html = html.replace(/<script>\s*window\.GEMINI_API_KEY[\s\S]*?<\/script>/g, '');
        html = html.replace(/<\/head>/, `${injectedCode}\n</head>`);
        res.send(html);
      } else {
        res.status(404).send('Not Found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

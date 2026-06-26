import { Request, Response } from 'express';
import path from 'path';
import { MarkItDown } from 'markitdown';
import { SettingsService } from '../services/SettingsService';
import { GeminiService } from '../services/GeminiService';
import { BookStackService } from '../services/BookStackService';
import { OmnideskService } from '../services/OmnideskService';
import { vectorStore } from '../services/VectorStore';

export class ApiController {
  private settingsService = new SettingsService();
  private geminiService = new GeminiService();
  private bookStackService = new BookStackService();
  private omnideskService = new OmnideskService();
  private markItDown = new MarkItDown();

  public indexVectorDocument = async (req: Request, res: Response): Promise<any> => {
    try {
      const sessionId = req.headers['x-session-id'] as string || 'default';
      const { id, text, metadata } = req.body;
      if (!id || !text) return res.status(400).json({ error: 'id and text are required' });
      const settings = this.settingsService.getSettings();
      const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        console.warn('[ApiController] GEMINI_API_KEY not configured. Indexing will proceed with zero-vector fallback.');
      }
      await vectorStore.addDocument(sessionId, id, text, metadata, apiKey);
      res.json({ success: true, count: vectorStore.getDocumentsCount(sessionId) });
    } catch (e: any) {
      console.error('[ApiController] Failed to index vector document:', e.message || e);
      res.status(500).json({ error: e.message });
    }
  };

  public searchVectorStore = async (req: Request, res: Response): Promise<any> => {
    try {
      const sessionId = req.headers['x-session-id'] as string || 'default';
      const { query, limit } = req.body;
      if (!query) return res.status(400).json({ error: 'query is required' });
      const settings = this.settingsService.getSettings();
      const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        console.warn('[ApiController] GEMINI_API_KEY not configured. Search will proceed with zero-vector fallback.');
      }
      const results = await vectorStore.search(sessionId, query, parseInt(limit as string) || 5, apiKey);
      const safeResults = results.map(r => ({ id: r.id, text: r.text, metadata: r.metadata, score: r.score }));
      res.json({ results: safeResults });
    } catch (e: any) {
      console.error('[ApiController] Failed to search vector store:', e.message || e);
      res.status(500).json({ error: e.message });
    }
  };

  public getVectorStoreStats = async (req: Request, res: Response): Promise<any> => {
    const sessionId = req.headers['x-session-id'] as string || 'default';
    res.json({ count: vectorStore.getDocumentsCount(sessionId) });
  };

  public checkHealth = (req: Request, res: Response): void => {
    const settings = this.settingsService.getSettings();
    const hasKey = !!(settings.geminiApiKey || process.env.GEMINI_API_KEY);
    res.json({ status: 'ok', environment: process.env.NODE_ENV || 'development', key: hasKey });
  };

  public getConfig = (req: Request, res: Response): void => {
    res.json({
      bookstack: {
        hasEnv: !!(process.env.BOOKSTACK_BASE_URL && process.env.BOOKSTACK_TOKEN_ID && process.env.BOOKSTACK_TOKEN_SECRET),
        envBaseUrl: process.env.BOOKSTACK_BASE_URL || ''
      },
      omnidesk: {
        hasEnv: !!(process.env.OMNIDESK_DOMAIN && process.env.OMNIDESK_EMAIL && process.env.OMNIDESK_API_KEY),
        envDomain: process.env.OMNIDESK_DOMAIN || ''
      }
    });
  };

  public getSettings = (req: Request, res: Response): void => {
    try {
      const settings = this.settingsService.getSettings();
      // Masking sensitive Data
      if (settings.geminiApiKey) settings.geminiApiKey = 'SERVER_MANAGED';
      if (settings.bookstack) {
        if (settings.bookstack.tokenId) settings.bookstack.tokenId = 'SERVER_MANAGED';
        if (settings.bookstack.tokenSecret) settings.bookstack.tokenSecret = 'SERVER_MANAGED';
      }
      if (settings.omnidesk) {
        if (settings.omnidesk.apiKey) settings.omnidesk.apiKey = 'SERVER_MANAGED';
      }
      res.json(settings);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };

  public updateSettings = (req: Request, res: Response): void => {
    try {
      const updates = { ...req.body };
      
      // Безопасность: запрет перезаписи секретов через открытый эндпоинт
      const sensitiveFields = [
        'geminiApiKey', 
        'password', 
        'bookstack_creds', 
        'omnidesk_creds',
        'bookstack',
        'omnidesk'
      ];

      sensitiveFields.forEach(field => {
        if (field in updates) delete updates[field];
      });

      this.settingsService.updateSettings(updates);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };

  public processSource = async (req: Request, res: Response): Promise<any> => {
    try {
      const file = req.file;
      const text = req.body.text || '';
      const useMarkItDown = req.body.useMarkItDown === 'true' || req.body.useMarkItDown === true;
      
      if (file) {
        let name = file.originalname;
        try {
          name = Buffer.from(file.originalname, 'latin1').toString('utf8');
        } catch {
          // Fallback to original
        }

        let markitdownText = '';
        let isParsedLocally = false;

        if (useMarkItDown) {
          try {
            const ext = path.extname(name).toLowerCase();
            const conversionResult = await this.markItDown.convert(file.buffer, {
              fileExtension: ext
            });
            if (conversionResult && conversionResult.markdown !== undefined) {
              markitdownText = conversionResult.markdown;
              isParsedLocally = true;
            }
          } catch (midError: any) {
            console.error('Failed to parse file with MarkItDown:', midError);
          }
        }

        let metadata = {};
        if (file.mimetype === 'application/pdf') {
          try {
            metadata = this.extractPdfMetadata(file.buffer);
          } catch (pdfError) {
            console.warn('Failed to extract PDF metadata:', pdfError);
          }
        }

        return res.json({ 
          base64: file.buffer.toString('base64'), 
          mimeType: file.mimetype,
          name,
          metadata,
          markitdownText,
          isParsedLocally
        });
      }
      
      if (!text) return res.status(400).json({ error: 'Не предоставлен контент' });
      res.json({ content: text, name: 'Ручной ввод' });
    } catch (error: any) {
      console.error('Ошибка обработки запроса:', error);
      res.status(500).json({ error: `Ошибка сервера: ${error.message}` });
    }
  };

  public generateGemini = async (req: Request, res: Response): Promise<any> => {
    const settings = this.settingsService.getSettings();
    const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    
    const { model, contents, config } = req.body;
    if (!model || !contents) return res.status(400).json({ error: 'model and contents are required' });
    
    try {
      const result = await this.geminiService.generateContent(apiKey, model, contents, config);
      res.json({ text: result.text, modelUsed: result.modelUsed });
    } catch (error: any) {
      console.error('[Gemini Error]', error?.message || error);
      
      let errMsg = error?.message || 'Gemini request failed';
      try {
        if (typeof errMsg === 'string' && errMsg.includes('{')) {
          const parsed = JSON.parse(errMsg);
          if (parsed.error && parsed.error.message) {
            errMsg = parsed.error.message;
          }
        }
      } catch (e) {}

      res.status(500).json({ error: errMsg });
    }
  };

  public generateArticle = async (req: Request, res: Response): Promise<any> => {
    const settings = this.settingsService.getSettings();
    const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    
    const { sources, goal, targetMode, availableContext, model, existingContent, systemInstruction, dataStructure, attachments } = req.body;
    
    try {
      const generationModel = model || 'gemini-3.1-flash-lite';
      const result = await this.geminiService.generateArticle(
        apiKey,
        sources || '',
        goal || 'Составьте краткий обзор и организуйте данные в профессиональное руководство.',
        targetMode || 'create',
        availableContext,
        generationModel,
        existingContent || '',
        systemInstruction || '',
        dataStructure || '',
        attachments
      );
      res.json(result);
    } catch (error: any) {
      console.error('[Article Generation Error]', error?.message || error);
      res.status(500).json({ error: error?.message || 'Не удалось сгенерировать статью' });
    }
  };

  public proxyBookStack = async (req: Request, res: Response): Promise<any> => {
    const { method, url, data, credentials } = req.body;
    const settings = this.settingsService.getSettings();
    
    const resolveCred = (envVal: string | undefined, setVal: string | undefined, credVal: string | undefined) => {
      if (envVal && envVal.trim()) return envVal.trim();
      if (setVal && setVal.trim()) return setVal.trim();
      if (credVal && credVal.trim() && credVal !== 'SERVER_MANAGED') return credVal.trim();
      return '';
    };

    const baseUrl = resolveCred(process.env.BOOKSTACK_BASE_URL, settings.bookstack?.baseUrl, credentials?.baseUrl);
    const tokenId = resolveCred(process.env.BOOKSTACK_TOKEN_ID, settings.bookstack?.tokenId, credentials?.tokenId);
    const tokenSecret = resolveCred(process.env.BOOKSTACK_TOKEN_SECRET, settings.bookstack?.tokenSecret, credentials?.tokenSecret);

    if (!baseUrl || !tokenId || !tokenSecret) {
      return res.status(400).json({ error: 'Missing BookStack credentials. Please check settings or .env file.' });
    }

    try {
      const { status, data: responseData } = await this.bookStackService.proxyRequest(baseUrl, tokenId, tokenSecret, method, url, data);
      res.status(status).json(responseData);
    } catch (error: any) {
      const status = error.response?.status || 500;
      let errorData = error.response?.data || { message: error.message };

      if (typeof errorData === 'string' && errorData.toLowerCase().includes('<html')) {
        errorData = { message: 'Received HTML error page from server. Please check if your Base URL is correct.' };
      }

      console.error(`[BookStack Error] ${method} ${url} - Status: ${status} - Message:`, errorData.message || errorData.error?.message || 'Unknown error');
      
      let errorMessage = 'An error occurred with BookStack API. Please check your credentials and Base URL.';
      if (errorData.error?.message) errorMessage = errorData.error.message;
      else if (errorData.message) errorMessage = errorData.message;
      else if (status === 404) errorMessage = 'API endpoint not found. Ensure BookStack version supports API and Base URL is correct.';
      else if (status === 401) errorMessage = 'Unauthorized. Please check your Token ID and Secret.';
      
      res.status(status).json({ 
        error: errorMessage,
        details: typeof errorData === 'object' ? errorData : { raw: String(errorData) }
      });
    }
  };

  public fetchOmnideskTicket = async (req: Request, res: Response): Promise<any> => {
    const { ticketId, domain, email, apiKey } = req.body;
    const settings = this.settingsService.getSettings();
    
    const resolveCred = (envVal: string | undefined, setVal: string | undefined, credVal: string | undefined) => {
      if (envVal && envVal.trim()) return envVal.trim();
      if (setVal && setVal.trim()) return setVal.trim();
      if (credVal && credVal.trim() && credVal !== 'SERVER_MANAGED') return credVal.trim();
      return '';
    };

    const targetDomain = resolveCred(process.env.OMNIDESK_DOMAIN, settings.omnidesk?.domain, domain);
    const targetEmail = resolveCred(process.env.OMNIDESK_EMAIL, settings.omnidesk?.email, email);
    const targetApiKey = resolveCred(process.env.OMNIDESK_API_KEY, settings.omnidesk?.apiKey, apiKey);
    
    if (!ticketId || !targetDomain || !targetEmail || !targetApiKey) {
      return res.status(400).json({ error: 'Необходимо указать ID тикета и учетные данные Omnidesk (через настройки или .env)' });
    }

    try {
      const ticketData = await this.omnideskService.getTicket(targetDomain, targetEmail, targetApiKey, ticketId);
      res.json({ content: ticketData.content, name: `Omnidesk Ticket #${ticketId}`, attachments: ticketData.attachments });
    } catch (error: any) {
      console.error('[Omnidesk Error]', error?.message);
      res.status(500).json({ error: error?.message || 'Не удалось получить тикет из Omnidesk' });
    }
  };

  public handleOmnideskWebhook = async (req: Request, res: Response): Promise<any> => {
    // This endpoint can be used by an Omnidesk Custom App (widget)
    // to send ticket content directly for background processing.
    const { ticketId, subject, messages, domain } = req.body;
    
    if (!ticketId || !messages) {
      return res.status(400).json({ error: 'Пейлоад должен содержать ticketId и messages' });
    }

    try {
      // In a real scenario, this would trigger background processing (e.g. queue)
      // to generate an article via Gemini and push to BookStack.
      // For now, returning success so the widget knows the request was received.
      console.log(`[Omnidesk Webhook] Получены данные для тикета #${ticketId}`);
      
      res.json({ success: true, message: 'Тикет поставлен в очередь на создание статьи' });
    } catch (error: any) {
      console.error('[Omnidesk Webhook Error]', error?.message);
      res.status(500).json({ error: 'Внутренняя ошибка сервера при обработке вебхука' });
    }
  };

  public updateSecureSettings = async (req: Request, res: Response): Promise<any> => {
    const { password, geminiApiKey, bookstack, omnidesk } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin';

    if (password !== adminPassword) {
      if (!process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Неверный пароль администратора. Так как переменная ADMIN_PASSWORD не задана в системе, используйте дефолтный пароль "admin" для внесения изменений.' });
      }
      return res.status(401).json({ error: 'Неверный пароль администратора' });
    }

    try {
      const currentSettings = this.settingsService.getSettings();
      const updates: any = {};
      
      if (geminiApiKey !== undefined && geminiApiKey !== 'SERVER_MANAGED') {
        updates.geminiApiKey = geminiApiKey;
      }
      
      if (bookstack) {
        updates.bookstack = { ...currentSettings.bookstack };
        if (bookstack.baseUrl !== undefined) updates.bookstack.baseUrl = bookstack.baseUrl;
        if (bookstack.tokenId !== undefined && bookstack.tokenId !== 'SERVER_MANAGED') updates.bookstack.tokenId = bookstack.tokenId;
        if (bookstack.tokenSecret !== undefined && bookstack.tokenSecret !== 'SERVER_MANAGED') updates.bookstack.tokenSecret = bookstack.tokenSecret;
      }
      
      if (omnidesk) {
        updates.omnidesk = { ...currentSettings.omnidesk };
        if (omnidesk.domain !== undefined) updates.omnidesk.domain = omnidesk.domain;
        if (omnidesk.email !== undefined && omnidesk.email !== 'SERVER_MANAGED') updates.omnidesk.email = omnidesk.email;
        if (omnidesk.apiKey !== undefined && omnidesk.apiKey !== 'SERVER_MANAGED') updates.omnidesk.apiKey = omnidesk.apiKey;
      }

      this.settingsService.updateSettings(updates);
      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  };

  private extractPdfMetadata(buffer: Buffer): any {
    const text = buffer.toString('binary');
    const metadata: any = {
      title: '',
      author: '',
      creationDate: ''
    };
    
    const titleMatch = text.match(/\/Title\s*\(([^)]+)\)/);
    if (titleMatch) {
      metadata.title = this.cleanPdfString(titleMatch[1]);
    }
    
    const authorMatch = text.match(/\/Author\s*\(([^)]+)\)/);
    if (authorMatch) {
      metadata.author = this.cleanPdfString(authorMatch[1]);
    }
    
    const dateMatch = text.match(/\/CreationDate\s*\(([^)]+)\)/);
    if (dateMatch) {
      let dateStr = this.cleanPdfString(dateMatch[1]);
      if (dateStr.startsWith('D:')) {
        const match = dateStr.match(/^D:(\d{4})(\d{2})(\d{2})/);
        if (match) {
          dateStr = `${match[3]}.${match[2]}.${match[1]}`;
        }
      }
      metadata.creationDate = dateStr;
    }
    
    return metadata;
  }

  private cleanPdfString(str: string): string {
    let cleaned = str.replace(/\\([\s\S])/g, '$1');
    cleaned = cleaned.replace(/\0/g, '');
    if (cleaned.startsWith('\xfe\xff') || cleaned.startsWith('\xff\xfe')) {
      cleaned = cleaned.slice(2).replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
    }
    return cleaned.trim();
  }
}

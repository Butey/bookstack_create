import { Request, Response } from 'express';
import { SettingsService } from '../services/SettingsService';
import { GeminiService } from '../services/GeminiService';
import { BookStackService } from '../services/BookStackService';

export class ApiController {
  private settingsService = new SettingsService();
  private geminiService = new GeminiService();
  private bookStackService = new BookStackService();

  public checkHealth = (req: Request, res: Response): void => {
    res.json({ status: 'ok', environment: process.env.NODE_ENV || 'development', key: !!process.env.GEMINI_API_KEY });
  };

  public getConfig = (req: Request, res: Response): void => {
    res.json({
      hasEnvCredentials: !!(process.env.BOOKSTACK_BASE_URL && process.env.BOOKSTACK_TOKEN_ID && process.env.BOOKSTACK_TOKEN_SECRET),
      envBaseUrl: process.env.BOOKSTACK_BASE_URL || ''
    });
  };

  public getSettings = (req: Request, res: Response): void => {
    try {
      const settings = this.settingsService.getSettings();
      res.json(settings);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };

  public updateSettings = (req: Request, res: Response): void => {
    try {
      this.settingsService.updateSettings(req.body);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };

  public processSource = (req: Request, res: Response): any => {
    try {
      const { file } = req;
      const text = req.body.text || '';
      
      if (file) {
        let name = file.originalname;
        try {
          name = Buffer.from(file.originalname, 'latin1').toString('utf8');
        } catch {
          // Fallback to original
        }

        return res.json({ 
          base64: file.buffer.toString('base64'), 
          mimeType: file.mimetype,
          name 
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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    
    const { model, contents, config } = req.body;
    if (!model || !contents) return res.status(400).json({ error: 'model and contents are required' });
    
    try {
      const text = await this.geminiService.generateContent(apiKey, model, contents, config);
      res.json({ text });
    } catch (error: any) {
      console.error('[Gemini Error]', error?.message);
      res.status(500).json({ error: error?.message || 'Gemini request failed' });
    }
  };

  public proxyBookStack = async (req: Request, res: Response): Promise<any> => {
    const { method, url, data, credentials } = req.body;
    const baseUrl = (process.env.BOOKSTACK_BASE_URL || credentials?.baseUrl)?.trim();
    const tokenId = (process.env.BOOKSTACK_TOKEN_ID || credentials?.tokenId)?.trim();
    const tokenSecret = (process.env.BOOKSTACK_TOKEN_SECRET || credentials?.tokenSecret)?.trim();

    if (!baseUrl || !tokenId || !tokenSecret) {
      return res.status(400).json({ error: 'Missing BookStack credentials. Please check settings.' });
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
}

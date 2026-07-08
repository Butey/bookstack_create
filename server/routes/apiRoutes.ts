import { Router } from 'express';
import multer from 'multer';
import { ApiController } from '../controllers/ApiController';

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

export const apiRouter = Router();
const apiController = new ApiController();

apiRouter.get('/health', apiController.checkHealth);
apiRouter.get('/config', apiController.getConfig);

apiRouter.route('/settings')
  .get(apiController.getSettings)
  .post(apiController.updateSettings);

apiRouter.post('/settings/secure-update', apiController.updateSecureSettings);
apiRouter.post('/admin/verify-password', apiController.verifyAdminPassword);
apiRouter.post('/admin/import-skills', apiController.importSkills);

apiRouter.post('/process-source', upload.single('file'), apiController.processSource);
apiRouter.post('/gemini/generate', apiController.generateGemini);
apiRouter.post('/gemini/generate-article', apiController.generateArticle);
apiRouter.post('/bookstack/proxy', apiController.proxyBookStack);
apiRouter.post('/omnidesk/ticket', apiController.fetchOmnideskTicket);
apiRouter.post('/omnidesk/webhook', apiController.handleOmnideskWebhook);

apiRouter.post('/vectordb/index', apiController.indexVectorDocument);
apiRouter.post('/vectordb/search', apiController.searchVectorStore);
apiRouter.get('/vectordb/stats', apiController.getVectorStoreStats);

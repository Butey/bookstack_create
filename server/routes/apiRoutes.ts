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

apiRouter.post('/process-source', upload.single('file'), apiController.processSource);
apiRouter.post('/gemini/generate', apiController.generateGemini);
apiRouter.post('/bookstack/proxy', apiController.proxyBookStack);

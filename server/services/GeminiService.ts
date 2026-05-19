import { GoogleGenAI } from '@google/genai';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class GeminiService {
  public async generateContent(apiKey: string, model: string, contents: any, config?: any, retries = 5): Promise<string> {
    const ai = new GoogleGenAI({ apiKey });
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await ai.models.generateContent({ model, contents, config });
        return response.text || '';
      } catch (error: any) {
        const errStr = typeof error === 'string' ? error : JSON.stringify(error) + (error?.message || '');
        const isRetryable = error?.status === 503 || error?.status === 429 ||
                      error?.response?.status === 503 || error?.response?.status === 429 ||
                      errStr.includes('503') || errStr.includes('429') ||
                      errStr.includes('high demand') || errStr.includes('UNAVAILABLE') || errStr.includes('temporarily overloaded') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('Quota exceeded') ||
                      (error?.response?.data?.error?.code === 503) || (error?.response?.data?.error?.code === 429) || (error?.error?.code === 429);
        
        if (isRetryable && attempt < retries) {
          let delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
          
          // Try to extract retry delay from error if present
          const retryDelayStr = errStr.match(/retry in\s+([0-9.]+)\s*s/i)?.[1] || errStr.match(/retryDelay["']?\s*:\s*["']?([0-9.]+)s["']?/)?.[1];
          if (retryDelayStr && !isNaN(parseFloat(retryDelayStr))) {
            const requestedDelay = parseFloat(retryDelayStr) * 1000;
            
            if (requestedDelay > 15000) {
              // Если задержка слишком большая, сразу прерываем и сообщаем пользователю
              throw new Error(`[QUOTA_EXCEEDED] Превышена квота запросов к ИИ. Пожалуйста, смените модель или повторите попытку через ${(requestedDelay / 1000).toFixed(0)} секунд.`);
            }

            if (requestedDelay > 0) { 
              delay = requestedDelay + 1000 + Math.random() * 1000; // requested delay + 1s buffer + jitter
            }
          }
          
          console.warn(`[GeminiService] Получена ошибка (попытка ${attempt + 1} из ${retries + 1}). Повторная попытка через ${delay.toFixed(0)}мс...`);
          await sleep(delay);
          continue;
        }
        
        if (error?.status === 404 || error?.response?.status === 404 || errStr.includes('is not found for API version') || errStr.includes('is not supported')) {
          throw new Error(`[INVALID_MODEL] Модель "${model}" не поддерживается или не найдена. Попробуйте выбрать другую в настройках.`);
        }

        if (errStr.includes('Quota exceeded') || errStr.includes('You exceeded your current quota') || error?.status === 429 || error?.response?.status === 429) {
          throw new Error(`[QUOTA_EXCEEDED] Превышена квота запросов к ИИ. Пожалуйста, смените модель в настройках.`);
        }

        throw new Error(`Gemini API Error: ${error?.message || errStr}`);
      }
    }
    
    throw new Error('API Gemini недоступно после нескольких попыток. Пожалуйста, попробуйте позже.');
  }
}



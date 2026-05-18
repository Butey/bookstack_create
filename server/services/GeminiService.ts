import { GoogleGenAI } from '@google/genai';

export class GeminiService {
  public async generateContent(apiKey: string, model: string, contents: any, config?: any): Promise<string> {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({ model, contents, config });
    return response.text || '';
  }
}

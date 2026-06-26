import path from 'path';
import { GoogleGenAI } from '@google/genai';

export interface VectorDocument {
  id: string; // unique id (e.g. "bookstack:page:15" or "ticket:123")
  text: string;
  metadata: any;
  embedding: number[];
}

export class VectorStore {
  private sessionDocuments: Record<string, VectorDocument[]> = {};

  constructor() {
    // No longer loading from disk for session isolation + "reset on refresh" requirement
  }

  private async getEmbedding(text: string, apiKey: string): Promise<number[]> {
    if (!apiKey) {
      console.warn('[VectorStore] API-ключ Gemini не передан. Будет использован нулевой вектор (fallback).');
      return new Array(768).fill(0);
    }
    const ai = new GoogleGenAI({ apiKey });
    // Truncate text to avoid token limits. gemini-embedding-2-preview supports a decent amount, but we want to be safe.
    const safeText = text.length > 8000 ? text.substring(0, 8000) : text;
    try {
      const response = await ai.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents: safeText,
      });
      return response.embeddings?.[0]?.values || new Array(768).fill(0);
    } catch (e: any) {
      console.error('[VectorStore] Embedding generation failed for text length', text.length, 'Error:', e.message || e);
      // Fallback gracefully instead of throwing to prevent app crash and 500 responses
      return new Array(768).fill(0);
    }
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
    if (vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  public async addDocument(sessionId: string, id: string, text: string, metadata: any = {}, apiKey: string) {
    if (!sessionId) sessionId = 'default';
    if (!this.sessionDocuments[sessionId]) {
      this.sessionDocuments[sessionId] = [];
    }

    const embedding = await this.getEmbedding(text, apiKey);
    const docs = this.sessionDocuments[sessionId];
    const existingIndex = docs.findIndex(d => d.id === id);
    
    if (existingIndex >= 0) {
      docs[existingIndex] = { id, text, metadata, embedding };
    } else {
      docs.push({ id, text, metadata, embedding });
    }
  }

  public async search(sessionId: string, query: string, limit: number = 5, apiKey: string): Promise<Array<VectorDocument & { score: number }>> {
    if (!sessionId) sessionId = 'default';
    const docs = this.sessionDocuments[sessionId] || [];
    
    if (docs.length === 0) return [];
    
    const queryEmbedding = await this.getEmbedding(query, apiKey);
    
    const results = docs.map(doc => {
      const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
      return { ...doc, score };
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  public getDocumentsCount(sessionId: string) {
    if (!sessionId) sessionId = 'default';
    return this.sessionDocuments[sessionId]?.length || 0;
  }
}

// Singleton instance
export const vectorStore = new VectorStore();

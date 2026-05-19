import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

export interface VectorDocument {
  id: string; // unique id (e.g. "bookstack:page:15" or "ticket:123")
  text: string;
  metadata: any;
  embedding: number[];
}

const DB_PATH = path.join(process.cwd(), '.data', 'vector_store.json');

export class VectorStore {
  private documents: VectorDocument[] = [];

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const data = fs.readFileSync(DB_PATH, 'utf-8');
        this.documents = JSON.parse(data);
      } else {
        // Ensure dir exists
        fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
        this.documents = [];
      }
    } catch (e) {
      console.error('Failed to load vector store', e);
      this.documents = [];
    }
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify(this.documents));
    } catch (e) {
      console.error('Failed to save vector store', e);
    }
  }

  private async getEmbedding(text: string, apiKey: string): Promise<number[]> {
    const ai = new GoogleGenAI({ apiKey });
    // Truncate text to avoid token limits. gemini-embedding-2-preview supports a decent amount, but we want to be safe.
    const safeText = text.length > 8000 ? text.substring(0, 8000) : text;
    try {
      const response = await ai.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents: safeText,
      });
      return response.embeddings?.[0]?.values || [];
    } catch (e: any) {
      console.error('Embedding failed for text length', text.length, 'Error:', e.message);
      throw e;
    }
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
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

  public async addDocument(id: string, text: string, metadata: any = {}, apiKey: string) {
    const embedding = await this.getEmbedding(text, apiKey);
    const existingIndex = this.documents.findIndex(d => d.id === id);
    if (existingIndex >= 0) {
      this.documents[existingIndex] = { id, text, metadata, embedding };
    } else {
      this.documents.push({ id, text, metadata, embedding });
    }
    this.save();
  }

  public async search(query: string, limit: number = 5, apiKey: string): Promise<Array<VectorDocument & { score: number }>> {
    if (this.documents.length === 0) return [];
    
    const queryEmbedding = await this.getEmbedding(query, apiKey);
    
    const results = this.documents.map(doc => {
      const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
      return { ...doc, score };
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  public getDocumentsCount() {
    return this.documents.length;
  }
}

// Singleton instance
export const vectorStore = new VectorStore();

import axios, { Method } from 'axios';
import https from 'https';

interface CacheEntry {
  data: any;
  status: number;
  expiry: number;
}

export class BookStackService {
  private httpsAgent = new https.Agent({ rejectUnauthorized: false });
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 минут кеша

  public async proxyRequest(baseUrl: string, tokenId: string, tokenSecret: string, method: Method | string, url: string, data?: any): Promise<{ status: number, data: any }> {
    const isGet = (method as string).toUpperCase() === 'GET';
    const cacheKey = `${baseUrl}|${tokenId}|${url}`;

    if (isGet) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        return { status: cached.status, data: cached.data };
      }
    }

    const response = await axios({
      method,
      url: `${baseUrl.replace(/\/$/, '')}${url}`,
      headers: {
        'Authorization': `Token ${tokenId}:${tokenSecret}`,
        'Accept': 'application/json',
        ...(isGet === false && { 'Content-Type': 'application/json' })
      },
      httpsAgent: this.httpsAgent,
      ...(data && { data })
    });
    
    if (isGet && response.status === 200) {
      this.cache.set(cacheKey, {
        data: response.data,
        status: response.status,
        expiry: Date.now() + this.CACHE_TTL
      });
    } else if (!isGet) {
      // Инвалидация кеша для этого инстанса при любых изменениях
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${baseUrl}|${tokenId}|`)) {
          this.cache.delete(key);
        }
      }
    }
    
    return { status: response.status, data: response.data };
  }
}

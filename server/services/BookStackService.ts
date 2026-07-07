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
  private lastPruneTime = Date.now();
  private readonly PRUNE_INTERVAL = 10 * 60 * 1000; // Очистка каждые 10 минут

  /**
   * Периодическая очистка устаревших записей в кеше во избежание утечек памяти
   */
  private pruneExpiredCache(): void {
    const now = Date.now();
    if (now - this.lastPruneTime < this.PRUNE_INTERVAL) return;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry <= now) {
        this.cache.delete(key);
      }
    }
    this.lastPruneTime = now;
  }

  public async proxyRequest(
    baseUrl: string,
    tokenId: string,
    tokenSecret: string,
    method: Method | string,
    url: string,
    data?: any,
    retries = 3,
    backoff = 1000
  ): Promise<{ status: number; data: any }> {
    const isGet = (method as string).toUpperCase() === 'GET';
    const cacheKey = `${baseUrl}|${tokenId}|${url}`;

    // Периодически чистим кеш
    this.pruneExpiredCache();

    if (isGet) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        return { status: cached.status, data: cached.data };
      }
    }

    try {
      const response = await axios({
        method,
        url: `${baseUrl.replace(/\/$/, '')}${url}`,
        headers: {
          'Authorization': `Token ${tokenId}:${tokenSecret}`,
          'Accept': 'application/json',
          ...(isGet === false && { 'Content-Type': 'application/json' })
        },
        httpsAgent: this.httpsAgent,
        timeout: 30000, // Разумный таймаут 30 сек (вместо 600 сек) для предотвращения зависания сокетов сервера
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
    } catch (error: any) {
      const status = error.response?.status;
      // Повторяем запрос при 502, 503, 504 или ECONNRESET
      const shouldRetry = (status === 502 || status === 503 || status === 504 || error.code === 'ECONNRESET') && retries > 0;
      
      if (shouldRetry) {
        console.warn(`[BookStackService] Ошибка ${status || error.code} при обращении к ${url}. Повтор через ${backoff} мс (Осталось попыток: ${retries})`);
        await new Promise(res => setTimeout(res, backoff));
        return this.proxyRequest(baseUrl, tokenId, tokenSecret, method, url, data, retries - 1, backoff * 2);
      }

      throw error;
    }
  }
}


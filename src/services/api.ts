import axios from 'axios';
import { BookStackCredentials } from '../types';

const responseCache = new Map<string, any>();

export async function bookstackProxy(
  credentials: BookStackCredentials,
  method: string,
  url: string,
  data?: any
) {
  const response = await axios.post('/api/bookstack/proxy', {
    method,
    url,
    data,
    credentials
  });
  return response.data;
}

export async function fetchBooks(credentials: BookStackCredentials, onUpdate?: (data: any[]) => void) {
  const cacheKey = `books-${credentials.baseUrl}`;
  const cached = responseCache.get(cacheKey);

  const fetchPromise = bookstackProxy(credentials, 'GET', '/api/books?count=200').then((data: any) => {
    const result = data.data || [];
    if (!Array.isArray(result)) return [];
    
    if (JSON.stringify(cached) !== JSON.stringify(result)) {
      responseCache.set(cacheKey, result);
      if (onUpdate && cached) onUpdate(result);
    }
    return result;
  });

  if (cached) {
    fetchPromise.catch(console.error);
    return cached;
  }
  return fetchPromise;
}

export async function fetchChaptersAndPages(credentials: BookStackCredentials, bookId: number, onUpdate?: (data: { chapters: any[], pages: any[] }) => void) {
  const cacheKey = `book-${bookId}-${credentials.baseUrl}`;
  const cached = responseCache.get(cacheKey);

  const fetchPromise = bookstackProxy(credentials, 'GET', `/api/books/${bookId}`).then((data: any) => {
    const chapters = data.chapters || (data.contents ? data.contents.filter((c: any) => c.type === 'chapter') : []);
    const pages = data.pages || (data.contents ? data.contents.filter((c: any) => c.type === 'page') : []);
    const result = { chapters, pages };
    
    if (JSON.stringify(cached) !== JSON.stringify(result)) {
      responseCache.set(cacheKey, result);
      if (onUpdate && cached) onUpdate(result);
    }
    return result;
  });

  if (cached) {
    fetchPromise.catch(console.error);
    return cached;
  }
  return fetchPromise;
}

export async function fetchChapterPages(credentials: BookStackCredentials, chapterId: number, onUpdate?: (data: any[]) => void) {
  const cacheKey = `chapter-${chapterId}-${credentials.baseUrl}`;
  const cached = responseCache.get(cacheKey);

  const fetchPromise = bookstackProxy(credentials, 'GET', `/api/chapters/${chapterId}`).then((data: any) => {
    const result = data.pages || (data.contents ? data.contents.filter((c: any) => c.type === 'page') : []);
    
    if (JSON.stringify(cached) !== JSON.stringify(result)) {
      responseCache.set(cacheKey, result);
      if (onUpdate && cached) onUpdate(result);
    }
    return result;
  });

  if (cached) {
    fetchPromise.catch(console.error);
    return cached;
  }
  return fetchPromise;
}

export async function fetchPage(credentials: BookStackCredentials, pageId: number) {
  const data = await bookstackProxy(credentials, 'GET', `/api/pages/${pageId}`);
  return data; // Returns full page object with markdown/html
}

export async function searchPages(credentials: BookStackCredentials, query: string) {
  const data = await bookstackProxy(credentials, 'GET', `/api/search?query=${encodeURIComponent(query)}`);
  return data.data; // BookStack search returns { data: [...results] }
}

export async function syncBookstackToVectorStore(
  credentials: BookStackCredentials,
  onProgress?: (msg: string) => void
) {
  let offset = 0;
  const count = 100;
  let total = 0;
  let indexed = 0;

  try {
    // 1. Fetch total pages count
    const initialData = await bookstackProxy(credentials, 'GET', `/api/pages?count=1`);
    total = initialData.total || 0;
    
    if (total === 0) {
      onProgress?.('База BookStack пуста.');
      return;
    }

    onProgress?.(`Найдено ${total} статей в BookStack. Начинается загрузка...`);

    // 2. Paginate over all pages
    while (offset < total) {
      const pageDataList = await bookstackProxy(credentials, 'GET', `/api/pages?count=${count}&offset=${offset}`);
      if (!pageDataList.data || pageDataList.data.length === 0) break;

      for (const shallowPage of pageDataList.data) {
        try {
          // get full content
          const fullPage = await fetchPage(credentials, shallowPage.id);
          const text = fullPage.markdown || fullPage.html || fullPage.raw_html || '';
          
          if (text.trim().length > 0) {
            const pageUrl = fullPage.url || `${credentials.baseUrl}/books/${fullPage.book_id}/page/${fullPage.id}`;
            await indexVectorDocument(`bookstack:page:${fullPage.id}`, text, {
              name: fullPage.name,
              book_id: fullPage.book_id,
              url: pageUrl,
              type: 'bookstack_page'
            });
            indexed++;
            onProgress?.(`Проиндексировано: ${indexed} из ${total}...`);
          }
        } catch (err) {
          console.error(`Failed to index page ${shallowPage.id}`, err);
        }
      }
      
      offset += count;
    }
    
    onProgress?.(`Индексация завершена. Всего проиндексировано ${indexed} статей.`);
  } catch (err: any) {
    console.error('BookStack sync error:', err);
    onProgress?.(`Ошибка индексации: ${err.message || 'Неизвестная ошибка'}`);
    throw err;
  }
}

export async function createPage(
  credentials: BookStackCredentials,
  bookId: number,
  chapterId: number | null,
  name: string,
  markdown: string,
  tags: string[] = []
) {
  const payload: any = {
    name,
    markdown,
    book_id: bookId,
    tags: tags.map(tag => ({ name: 'Category', value: tag }))
  };
  
  if (chapterId) {
    payload.chapter_id = chapterId;
  }

  return await bookstackProxy(credentials, 'POST', '/api/pages', payload);
}

export async function updatePage(
  credentials: BookStackCredentials,
  pageId: number,
  name: string,
  markdown: string,
  tags: string[] = []
) {
  const payload: any = {
    name,
    markdown,
    tags: tags.map(tag => ({ name: 'Category', value: tag }))
  };

  return await bookstackProxy(credentials, 'PUT', `/api/pages/${pageId}`, payload);
}

export async function createBook(credentials: BookStackCredentials, name: string, description: string = '') {
  return await bookstackProxy(credentials, 'POST', '/api/books', { name, description });
}

export async function createChapter(credentials: BookStackCredentials, bookId: number, name: string, description: string = '') {
  return await bookstackProxy(credentials, 'POST', '/api/chapters', { book_id: bookId, name, description });
}

export async function indexVectorDocument(id: string, text: string, metadata: any = {}) {
  const response = await axios.post('/api/vectordb/index', { id, text, metadata });
  return response.data;
}

export async function searchVectorStore(query: string, limit: number = 5) {
  if (!query || query.trim() === '') return [];
  const response = await axios.post('/api/vectordb/search', { query, limit });
  return response.data.results || [];
}

export async function getVectorStoreStats() {
  const response = await axios.get('/api/vectordb/stats');
  return response.data;
}

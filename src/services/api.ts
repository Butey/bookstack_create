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
    const result = data.data;
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

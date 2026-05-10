import axios from 'axios';
import { BookStackCredentials } from '../types';

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

export async function fetchBooks(credentials: BookStackCredentials) {
  const data = await bookstackProxy(credentials, 'GET', '/api/books');
  return data.data; // BookStack returns { data: [...] }
}

export async function fetchChaptersAndPages(credentials: BookStackCredentials, bookId: number) {
  const data = await bookstackProxy(credentials, 'GET', `/api/books/${bookId}`);
  
  // BookStack API can return data in different formats depending on version
  // Usually it has .chapters and .pages at top level OR inside .contents
  const chapters = data.chapters || (data.contents ? data.contents.filter((c: any) => c.type === 'chapter') : []);
  const pages = data.pages || (data.contents ? data.contents.filter((c: any) => c.type === 'page') : []);
  
  return { chapters, pages };
}

export async function fetchChapterPages(credentials: BookStackCredentials, chapterId: number) {
  const data = await bookstackProxy(credentials, 'GET', `/api/chapters/${chapterId}`);
  return data.pages || (data.contents ? data.contents.filter((c: any) => c.type === 'page') : []);
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

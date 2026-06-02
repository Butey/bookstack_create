export interface OmnideskCredentials {
  domain: string;
  email: string;
  apiKey: string;
}

export interface BookStackCredentials {
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
}

export interface BookStackBook {
  id: number;
  name: string;
  description: string;
}

export interface BookStackChapter {
  id: number;
  book_id: number;
  name: string;
  description: string;
}

export interface SyncConfig {
  credentials: BookStackCredentials;
  targetBookId: number | null;
  targetChapterId: number | null;
  mapping: {
    tags: string[]; // e.g. "NotebookLM", "AI-Generated"
    priority: 'high' | 'normal' | 'low';
    extractSummaryAsDescription: boolean;
  };
}

export interface BookStackPage {
  id: number;
  name: string;
  book_id: number;
  chapter_id?: number;
  markdown: string;
  tags?: { name: string; value: string } [];
}

export interface SourceMetadata {
  title?: string;
  author?: string;
  creationDate?: string;
}

export interface Source {
  name: string;
  content: string;
  selected?: boolean;
  isDuplicate?: boolean;
  isContext?: boolean;
  duplicateReference?: string;
  metadata?: SourceMetadata;
  attachments?: { mimeType: string; data: string; name: string }[];
}

export interface ProcessedArticle {
  title: string;
  content: string;
  thinking: string;
  markdown?: string;
  description?: string;
  targetPublishMode: 'create' | 'update';
  targetPublishPageId: number | null;
  targetPublishBookId: number | null;
  targetPublishChapterId?: number | null;
  tags: string[];
  targetBookId?: number | null;
  newBookName?: string;
  targetChapterId?: number | null;
  newChapterName?: string;
  duplicateLinks?: string[];
  originalMarkdown?: string;
  originalTitle?: string;
}

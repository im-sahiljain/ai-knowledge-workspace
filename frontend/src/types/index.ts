export interface User {
  id: string;
  email: string;
  username: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface Document {
  id: string;
  original_filename: string;
  file_size: number | null;
  page_count: number | null;
  status: "uploading" | "processing" | "ready" | "failed";
  error_message: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface DocumentList {
  documents: Document[];
  total: number;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  document_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface Citation {
  document_name: string;
  document_id: string;
  page_number: number | null;
  content: string;
  score: number | null;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  collection_id: string | null;
  message_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface ConversationDetail {
  id: string;
  title: string;
  collection_id: string | null;
  messages: Message[];
  created_at: string;
}

export interface ChatResponse {
  user_message: Message;
  assistant_message: Message;
  sources: Citation[];
}

export interface SearchResult {
  chunk_id: string;
  document_id: string;
  document_name: string;
  page_number: number | null;
  content: string;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  total: number;
}

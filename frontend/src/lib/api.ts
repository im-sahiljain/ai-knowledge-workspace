const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_URL;
  }

  private getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("access_token");
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // Don't set Content-Type for FormData (browser sets it with boundary)
    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Try to refresh
      const refreshed = await this.refreshToken();
      if (refreshed) {
        headers["Authorization"] = `Bearer ${this.getToken()}`;
        const retryResponse = await fetch(`${this.baseUrl}${endpoint}`, {
          ...options,
          headers,
        });
        if (!retryResponse.ok) {
          const error = await retryResponse.json().catch(() => ({ detail: "Request failed" }));
          throw new Error(error.detail || `HTTP ${retryResponse.status}`);
        }
        if (retryResponse.status === 204) return {} as T;
        return retryResponse.json();
      }
      // Refresh failed — clear auth
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");
      window.location.href = "/login";
      throw new Error("Session expired. Please log in again.");
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Request failed" }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    if (response.status === 204) return {} as T;
    return response.json();
  }

  private async refreshToken(): Promise<boolean> {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      return true;
    } catch {
      return false;
    }
  }

  // ─── Auth ───
  async register(email: string, username: string, password: string) {
    return this.request<import("@/types").TokenResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, username, password }),
    });
  }

  async login(email: string, password: string) {
    return this.request<import("@/types").TokenResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async getMe() {
    return this.request<import("@/types").User>("/api/v1/auth/me");
  }

  // ─── Documents ───
  async uploadDocument(file: File, onProgress?: (pct: number) => void) {
    const token = this.getToken();
    return new Promise<import("@/types").Document>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${this.baseUrl}/api/v1/documents/upload`);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.detail || `Upload failed: ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload"));

      const formData = new FormData();
      formData.append("file", file);
      xhr.send(formData);
    });
  }

  async listDocuments() {
    return this.request<import("@/types").DocumentList>("/api/v1/documents");
  }

  async getDocument(id: string) {
    return this.request<import("@/types").Document>(`/api/v1/documents/${id}`);
  }

  async getDocumentStatus(id: string) {
    return this.request<{ id: string; status: string; error_message: string | null; page_count: number | null }>(
      `/api/v1/documents/${id}/status`
    );
  }

  async deleteDocument(id: string) {
    return this.request<void>(`/api/v1/documents/${id}`, { method: "DELETE" });
  }

  // ─── Collections ───
  async createCollection(name: string, description?: string) {
    return this.request<import("@/types").Collection>("/api/v1/collections", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });
  }

  async listCollections() {
    return this.request<import("@/types").Collection[]>("/api/v1/collections");
  }

  async updateCollection(id: string, name?: string, description?: string) {
    return this.request<import("@/types").Collection>(`/api/v1/collections/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name, description }),
    });
  }

  async deleteCollection(id: string) {
    return this.request<void>(`/api/v1/collections/${id}`, { method: "DELETE" });
  }

  async addDocumentsToCollection(collectionId: string, documentIds: string[]) {
    return this.request<import("@/types").Collection>(
      `/api/v1/collections/${collectionId}/documents`,
      { method: "POST", body: JSON.stringify({ document_ids: documentIds }) }
    );
  }

  async removeDocumentsFromCollection(collectionId: string, documentIds: string[]) {
    return this.request<import("@/types").Collection>(
      `/api/v1/collections/${collectionId}/documents`,
      { method: "DELETE", body: JSON.stringify({ document_ids: documentIds }) }
    );
  }

  async getCollectionDocuments(collectionId: string) {
    return this.request<import("@/types").Document[]>(`/api/v1/collections/${collectionId}/documents`);
  }

  // ─── Chat ───
  async createConversation(title?: string, collectionId?: string) {
    return this.request<import("@/types").Conversation>("/api/v1/chat/conversations", {
      method: "POST",
      body: JSON.stringify({ title, collection_id: collectionId }),
    });
  }

  async listConversations() {
    return this.request<import("@/types").Conversation[]>("/api/v1/chat/conversations");
  }

  async getConversation(id: string) {
    return this.request<import("@/types").ConversationDetail>(`/api/v1/chat/conversations/${id}`);
  }

  async deleteConversation(id: string) {
    return this.request<void>(`/api/v1/chat/conversations/${id}`, { method: "DELETE" });
  }

  async sendMessage(conversationId: string, content: string, documentIds?: string[], collectionId?: string) {
    return this.request<import("@/types").ChatResponse>(
      `/api/v1/chat/conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          content,
          document_ids: documentIds,
          collection_id: collectionId,
        }),
      }
    );
  }

  // ─── Search ───
  async search(query: string, collectionId?: string, documentIds?: string[], topK?: number) {
    return this.request<import("@/types").SearchResponse>("/api/v1/search", {
      method: "POST",
      body: JSON.stringify({
        query,
        collection_id: collectionId,
        document_ids: documentIds,
        top_k: topK || 10,
      }),
    });
  }
}

export const api = new ApiClient();

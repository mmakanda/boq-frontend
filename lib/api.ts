// lib/api.ts — Centralised API client.
//
// Security:
//   - API_URL from NEXT_PUBLIC_API_URL (no secret)
//   - Auth tokens stored in localStorage, sent via Authorization header
//   - NEVER put ANTHROPIC_API_KEY or any backend secret here
//   - All error responses return typed ApiError
//   - 401 responses trigger automatic logout

import type { TokenResponse, User, BOQProject, ProjectListResponse, BOQResponse, BOQItem, ApiError } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

// ─── Token management (client-side only) ─────────────────────────────────────

export const TokenStore = {
  getAccess: (): string | null =>
    typeof window !== 'undefined' ? localStorage.getItem('boq_access') : null,

  getRefresh: (): string | null =>
    typeof window !== 'undefined' ? localStorage.getItem('boq_refresh') : null,

  set: (tokens: TokenResponse) => {
    localStorage.setItem('boq_access', tokens.access_token);
    localStorage.setItem('boq_refresh', tokens.refresh_token);
  },

  clear: () => {
    localStorage.removeItem('boq_access');
    localStorage.removeItem('boq_refresh');
  },
};

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

class ApiClient {
  private async request<T>(
    path: string,
    options: RequestInit = {},
    retry = true,
  ): Promise<T> {
    const token = TokenStore.getAccess();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    // Only set Content-Type for non-FormData bodies
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });

    // Auto-refresh on 401
    if (res.status === 401 && retry) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        return this.request<T>(path, options, false); // retry once
      } else {
        TokenStore.clear();
        window.location.href = '/auth/login';
        throw new Error('Session expired');
      }
    }

    if (!res.ok) {
      let errorDetail = `Request failed (${res.status})`;
      try {
        const errData: ApiError = await res.json();
        errorDetail = errData.detail || errorDetail;
      } catch { /* ignore json parse failure */ }
      throw new Error(errorDetail);
    }

    // Handle 204 No Content
    if (res.status === 204) return undefined as T;

    return res.json() as Promise<T>;
  }

  private async tryRefresh(): Promise<boolean> {
    const refresh = TokenStore.getRefresh();
    if (!refresh) return false;
    try {
      const res = await fetch(`${API_URL}/api/auth/token/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) return false;
      const tokens: TokenResponse = await res.json();
      TokenStore.set(tokens);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Auth ────────────────────────────────────────────────────────────────

  async register(email: string, password: string, full_name: string, company?: string): Promise<User> {
    return this.request<User>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name, company }),
    });
  }

  async login(email: string, password: string): Promise<TokenResponse> {
    const tokens = await this.request<TokenResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    TokenStore.set(tokens);
    return tokens;
  }

  async getMe(): Promise<User> {
    return this.request<User>('/api/auth/me');
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.request('/api/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async confirmPasswordReset(token: string, new_password: string): Promise<void> {
    await this.request('/api/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ token, new_password }),
    });
  }

  logout() {
    TokenStore.clear();
    window.location.href = '/auth/login';
  }

  // ─── Projects ────────────────────────────────────────────────────────────

  async listProjects(skip = 0, limit = 20): Promise<ProjectListResponse> {
    return this.request<ProjectListResponse>(
      `/api/projects?skip=${skip}&limit=${limit}`,
    );
  }

  async createProject(name: string, description?: string): Promise<BOQProject> {
    return this.request<BOQProject>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  async getProject(id: string): Promise<BOQProject> {
    return this.request<BOQProject>(`/api/projects/${id}`);
  }

  async deleteProject(id: string): Promise<void> {
    return this.request<void>(`/api/projects/${id}`, { method: 'DELETE' });
  }

  // ─── BOQ ─────────────────────────────────────────────────────────────────

  async uploadDrawing(projectId: string, file: File): Promise<void> {
    const form = new FormData();
    form.append('file', file);
    await this.request<void>(`/api/projects/${projectId}/upload`, {
      method: 'POST',
      body: form,
    });
  }

  async getBOQ(projectId: string): Promise<BOQResponse> {
    return this.request<BOQResponse>(`/api/projects/${projectId}/boq`);
  }

  async updateBOQItem(
    projectId: string,
    itemId: string,
    updates: Partial<Pick<BOQItem, 'description' | 'unit' | 'quantity' | 'unit_rate' | 'section'>>,
  ): Promise<BOQItem> {
    return this.request<BOQItem>(
      `/api/projects/${projectId}/boq/items/${itemId}`,
      { method: 'PATCH', body: JSON.stringify(updates) },
    );
  }

  getExportUrl(projectId: string): string {
    return `${API_URL}/api/projects/${projectId}/boq/export/xlsx`;
  }
}

export const api = new ApiClient();

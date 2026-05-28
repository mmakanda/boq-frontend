// lib/api.ts — Centralised API client.
import type {
  TokenResponse, User, BOQProject, ProjectListResponse,
  BOQResponse, BOQItem, RoadDimensions, ApiError
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

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

class ApiClient {
  private async request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
    const token = TokenStore.getAccess();
    const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });

    if (res.status === 401 && retry) {
      const refreshed = await this.tryRefresh();
      if (refreshed) return this.request<T>(path, options, false);
      TokenStore.clear();
      window.location.href = '/auth/login';
      throw new Error('Session expired');
    }

    if (!res.ok) {
      let errorDetail = `Request failed (${res.status})`;
      try {
        const errData: ApiError = await res.json();
        errorDetail = errData.detail || errorDetail;
      } catch { }
      throw new Error(errorDetail);
    }

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
    } catch { return false; }
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

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
      method: 'POST', body: JSON.stringify({ email }),
    });
  }

  async confirmPasswordReset(token: string, new_password: string): Promise<void> {
    await this.request('/api/auth/password-reset/confirm', {
      method: 'POST', body: JSON.stringify({ token, new_password }),
    });
  }

  logout() {
    TokenStore.clear();
    window.location.href = '/auth/login';
  }

  // ─── Projects ─────────────────────────────────────────────────────────────

  async listProjects(skip = 0, limit = 20): Promise<ProjectListResponse> {
    return this.request<ProjectListResponse>(`/api/projects?skip=${skip}&limit=${limit}`);
  }

  async createProject(name: string, description?: string, project_type?: string): Promise<BOQProject> {
    return this.request<BOQProject>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description, project_type: project_type || 'residential' }),
    });
  }

  async getProject(id: string): Promise<BOQProject> {
    return this.request<BOQProject>(`/api/projects/${id}`);
  }

  async deleteProject(id: string): Promise<void> {
    return this.request<void>(`/api/projects/${id}`, { method: 'DELETE' });
  }

  // ─── BOQ ──────────────────────────────────────────────────────────────────

  async uploadDrawing(projectId: string, file: File): Promise<void> {
    const form = new FormData();
    form.append('file', file);
    await this.request<void>(`/api/projects/${projectId}/upload`, {
      method: 'POST', body: form,
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
    return this.request<BOQItem>(`/api/projects/${projectId}/boq/items/${itemId}`, {
      method: 'PATCH', body: JSON.stringify(updates),
    });
  }

  async setRoadDimensions(projectId: string, dimensions: RoadDimensions): Promise<any> {
    return this.request<any>(`/api/projects/${projectId}/road-dimensions`, {
      method: 'POST', body: JSON.stringify(dimensions),
    });
  }

  async updateMargins(projectId: string, margins: {
    preliminaries_pct?: number;
    contingency_pct?: number;
    profit_margin_pct?: number;
  }): Promise<BOQProject> {
    return this.request<BOQProject>(`/api/projects/${projectId}/margins`, {
      method: 'PATCH', body: JSON.stringify(margins),
    });
  }

  getExportUrl(projectId: string): string {
    return `${API_URL}/api/projects/${projectId}/boq/export/xlsx`;
  }
}

export const api = new ApiClient();

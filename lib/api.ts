import type {
  BOQProject, ProjectListResponse, BOQResponse,
  BOQItem, RoadDimensions,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

let _getToken: (() => Promise<string | null>) | null = null;

export function setClerkTokenGetter(fn: () => Promise<string | null>) {
  _getToken = fn;
}

class ApiClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = _getToken ? await _getToken() : null;
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });

    if (res.status === 401) {
      window.location.href = '/sign-in';
      throw new Error('Session expired');
    }

    if (!res.ok) {
      let errorDetail = `Request failed (${res.status})`;
      try {
        const e = await res.json();
        errorDetail = e.detail || errorDetail;
      } catch { }
      throw new Error(errorDetail);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async listProjects(skip = 0, limit = 20): Promise<ProjectListResponse> {
    return this.request<ProjectListResponse>(
      `/api/projects?skip=${skip}&limit=${limit}`
    );
  }

  async createProject(
    name: string,
    description?: string,
    project_type?: string,
  ): Promise<BOQProject> {
    return this.request<BOQProject>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description,
        project_type: project_type || 'residential',
      }),
    });
  }

  async getProject(id: string): Promise<BOQProject> {
    return this.request<BOQProject>(`/api/projects/${id}`);
  }

  async deleteProject(id: string): Promise<void> {
    return this.request<void>(`/api/projects/${id}`, { method: 'DELETE' });
  }

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

  async setRoadDimensions(
    projectId: string,
    dimensions: RoadDimensions,
  ): Promise<any> {
    return this.request<any>(
      `/api/projects/${projectId}/road-dimensions`,
      { method: 'POST', body: JSON.stringify(dimensions) },
    );
  }

  async updateMargins(
    projectId: string,
    margins: {
      preliminaries_pct?: number;
      contingency_pct?: number;
      profit_margin_pct?: number;
    },
  ): Promise<BOQProject> {
    return this.request<BOQProject>(
      `/api/projects/${projectId}/margins`,
      { method: 'PATCH', body: JSON.stringify(margins) },
    );
  }

  getExportUrl(projectId: string): string {
    return `${API_URL}/api/projects/${projectId}/boq/export/xlsx`;
  }
}

export const api = new ApiClient();

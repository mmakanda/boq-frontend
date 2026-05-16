// types/index.ts — TypeScript types matching backend Pydantic schemas

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface BOQProject {
  id: string;
  name: string;
  description: string | null;
  status: 'processing' | 'ready' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string | null;
  item_count: number;
}

export interface ProjectListResponse {
  projects: BOQProject[];
  total: number;
}

export interface BOQItem {
  id: string;
  item_number: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  unit_rate: number | null;
  amount: number | null;
  section: string | null;
  source_page: number | null;
  confidence: number | null;
  is_user_edited: boolean;
}

export interface BOQResponse {
  project: BOQProject;
  items: BOQItem[];
  sections: string[];
  total_amount: number | null;
}

export interface ApiError {
  detail: string;
  request_id?: string;
}

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
  project_type: 'residential' | 'civil' | 'commercial' | 'steel' | 'dam' | 'renovation';
  status: 'processing' | 'ready' | 'failed';
  error_message: string | null;
  total_project_cost: number | null;
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
  materials_cost: number | null;
  labour_cost: number | null;
  material_specs: any[] | null;
  section: string | null;
  source_page: number | null;
  confidence: number | null;
  is_user_edited: boolean;
}

export interface MaterialScheduleItem {
  id: string;
  material_name: string;
  category: string | null;
  unit: string | null;
  quantity_required: number | null;
  unit_rate: number | null;
  total_cost: number | null;
  supplier_note: string | null;
  is_user_edited: boolean;
}

export interface CostSummary {
  total_materials_cost: number | null;
  total_labour_cost: number | null;
  total_subcontractor_cost: number | null;
  preliminaries_pct: number | null;
  contingency_pct: number | null;
  profit_margin_pct: number | null;
  total_project_cost: number | null;
}

export interface BOQResponse {
  project: BOQProject;
  items: BOQItem[];
  material_schedule: MaterialScheduleItem[];
  sections: string[];
  total_amount: number | null;
  cost_summary: CostSummary | null;
}

export interface RoadDimensions {
  road_length_m: number;
  carriageway_width_m: number;
  formation_width_m?: number;
  shoulder_width_m?: number;
  sidewalk_width_m?: number;
}

export interface ApiError {
  detail: string;
  request_id?: string;
}

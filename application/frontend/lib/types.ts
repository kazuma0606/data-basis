// ── Auth ──────────────────────────────────────────────────────────────────

export type Role = "engineer" | "marketer" | "store_manager" | "admin";

// ── Business ──────────────────────────────────────────────────────────────

export interface KpiSummary {
  active_customers: number;
  churn_rate: number;
  weekly_revenue: number;
  weekly_revenue_change: number;
}

export interface CustomerSummary {
  unified_id: string;
  full_name: string;
  email: string | null;
  segment: string | null;
  churn_risk: string | null;
  churn_score: number | null;
  total_spend: number | null;
  store_id: number | null;
}

export interface CustomerDetail extends CustomerSummary {
  phone: string | null;
  prefecture: string | null;
  gender: string | null;
  birth_year: number | null;
  suggested_products: ProductRecommendation[];
}

export interface CustomerListResponse {
  items: CustomerSummary[];
  total: number;
  offset: number;
  limit: number;
}

export interface SegmentCount {
  segment: string;
  count: number;
  percentage: number;
}

export interface SegmentTrend {
  week: string;
  segment: string;
  count: number;
}

export interface SalesByChannel {
  channel: string;
  revenue: number;
  transaction_count: number;
}

export interface CategoryAffinity {
  segment: string;
  category: string;
  affinity_score: number;
}

export interface ProductRecommendation {
  product_id: string;
  product_name: string;
  category: string;
  score: number;
}

export interface NLQueryResponse {
  answer: string;
  query: string;
}

// ── Ops ───────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: string;
  services: Record<string, string>;
}

export interface KafkaTopic {
  name: string;
  partitions: number;
  message_count: number;
  consumer_groups: string[];
}

export interface PipelineJob {
  job_id: string;
  job_name: string;
  status: string;
  records_processed: number | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface ScoringJob {
  job_id: string;
  job_type: string;
  status: string;
  records_scored: number | null;
  started_at: string;
  completed_at: string | null;
}

export interface TableSchema {
  table_name: string;
  columns: ColumnDef[];
}

export interface ColumnDef {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
}

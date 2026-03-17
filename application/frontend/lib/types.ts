// ── Auth ──────────────────────────────────────────────────────────────────

export type Role = "engineer" | "marketer" | "store_manager" | "admin";

// ── Business ──────────────────────────────────────────────────────────────

export interface KpiSummary {
  active_customers: number;
  dormant_customers: number;
  churned_customers: number;
  churn_rate: number;
  weekly_revenue: number;
}

export interface CustomerSummary {
  unified_id: number;
  canonical_name: string;
  email: string | null;
  phone: string | null;
  prefecture: string | null;
  churn_label: string | null; // 'active' | 'dormant' | 'churned' | null
}

export interface ChurnLabel {
  label: string;
  last_purchase_at: string | null;
  days_since_purchase: number | null;
  updated_at: string;
}

export interface CustomerScore {
  category_id: number;
  affinity_score: number;
  churn_risk_score: number;
  visit_predict_score: number;
  timing_score: number;
  updated_at: string;
}

export interface CustomerDetail {
  unified_id: number;
  canonical_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  prefecture: string | null;
  churn_label: ChurnLabel | null;
  scores: CustomerScore[];
}

export interface CustomerListResponse {
  items: CustomerSummary[];
  total: number;
  offset: number;
  limit: number;
}

export interface SegmentSummary {
  label: string;
  count: number;
  percentage: number;
}

export interface SegmentTrend {
  week: string;
  label: string;
  customer_count: number;
  avg_days_since_purchase: number;
}

export interface SalesByChannel {
  date: string;
  channel: string;
  store_id: number | null;
  category_id: number | null;
  total_amount: number;
  order_count: number;
  customer_count: number;
}

export interface CategoryAffinity {
  week: string;
  category_id: number;
  age_group: string;
  gender: string;
  avg_score: number;
  customer_count: number;
}

export interface ProductRecommendation {
  unified_product_id: number;
  name: string;
  brand: string | null;
  price: number | null;
  category_id: number | null;
  similarity: number;
}

export interface NLQueryResponse {
  query: string;
  answer: string;
}

// ── Status (認証不要 / Pod 監視) ──────────────────────────────────────────

export interface PodInfo {
  name: string;
  namespace: string;
  status: string;    // "Running" | "Pending" | "CrashLoopBackOff" etc.
  ready: string;     // "1/1"
  restarts: number;
  age: string;       // "2h" / "3d"
  image: string;     // イメージタグ（例: technomart-backend:v1.1-04b359d）
  message?: string;  // エラー時の詳細
}

export interface PodEvent {
  type: "ADDED" | "MODIFIED" | "DELETED";
  pod: PodInfo;
}

export interface ClusterHealth {
  nextjs: "ok";
  k8s_api: "ok" | "error";
  k8s_error?: string;
  pods: {
    running: number;
    pending: number;
    failed: number;
    unknown: number;
  };
}

export interface DeployRecord {
  environment: string;
  service: string;
  semver: string;
  git_hash: string;
  deployed_at: string;
}

// ── Ops ───────────────────────────────────────────────────────────────────

export interface ServiceHealth {
  name: string;
  status: string;
  error: string | null;
}

export interface HealthResponse {
  overall: string;
  services: ServiceHealth[];
}

export interface TopicInfo {
  name: string;
  partitions: number;
  message_count: number;
}

export interface ConsumerGroup {
  group_id: string;
  state: string;
}

export interface JobInfo {
  id: number;
  job_name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  records_processed: number | null;
  error_message: string | null;
}

export interface BatchInfo {
  id: number;
  batch_type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  records_processed: number | null;
  next_run_at: string | null;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  nullable: boolean;
  default: string | null;
}

export interface TableSchema {
  table_name: string;
  columns: ColumnInfo[];
}

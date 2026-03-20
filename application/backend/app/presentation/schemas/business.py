from datetime import date, datetime

from pydantic import BaseModel

# ── 顧客 ──────────────────────────────────────────────────────


class ChurnLabelSchema(BaseModel):
    label: str
    last_purchase_at: datetime | None
    days_since_purchase: int | None
    updated_at: datetime


class CustomerScoreSchema(BaseModel):
    category_id: int
    affinity_score: float
    churn_risk_score: float
    visit_predict_score: float
    timing_score: float
    updated_at: datetime


class CustomerSummarySchema(BaseModel):
    unified_id: int
    canonical_name: str
    email: str | None
    phone: str | None
    prefecture: str | None
    churn_label: str | None  # 'active' / 'dormant' / 'churned' / None


class CustomerDetailSchema(BaseModel):
    unified_id: int
    canonical_name: str
    email: str | None
    phone: str | None
    birth_date: date | None
    prefecture: str | None
    churn_label: ChurnLabelSchema | None
    scores: list[CustomerScoreSchema]


class CustomerListResponse(BaseModel):
    items: list[CustomerSummarySchema]
    total: int
    offset: int
    limit: int


# ── KPIサマリ ─────────────────────────────────────────────────


class KpiSummarySchema(BaseModel):
    active_customers: int
    dormant_customers: int
    churned_customers: int
    churn_rate: float
    weekly_revenue: int


# ── セグメント ────────────────────────────────────────────────


class SegmentSummarySchema(BaseModel):
    label: str
    count: int
    percentage: float


class SegmentTrendSchema(BaseModel):
    week: date
    label: str
    customer_count: int
    avg_days_since_purchase: float


# ── 売上分析 ──────────────────────────────────────────────────


class SalesByChannelSchema(BaseModel):
    date: date
    channel: str
    store_id: int | None
    category_id: int | None
    total_amount: int
    order_count: int
    customer_count: int


# ── カテゴリ親和性 ─────────────────────────────────────────────


class CategoryAffinitySchema(BaseModel):
    week: date
    category_id: int
    age_group: str
    gender: str
    avg_score: float
    customer_count: int


# ── レコメンデーション ─────────────────────────────────────────


class ProductRecommendationSchema(BaseModel):
    unified_product_id: int
    name: str
    brand: str | None
    price: int | None
    category_id: int | None
    similarity: float


# ── 自然言語クエリ ─────────────────────────────────────────────


class NLQueryRequest(BaseModel):
    query: str


class NLQueryResponse(BaseModel):
    query: str
    answer: str

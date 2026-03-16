from dataclasses import dataclass, field
from datetime import date, datetime


@dataclass(frozen=True)
class ChurnLabel:
    unified_id: int
    label: str  # 'active' / 'dormant' / 'churned'
    score: float
    updated_at: datetime


@dataclass(frozen=True)
class CustomerScore:
    unified_id: int
    category_id: int
    affinity_score: float
    churn_risk_score: float
    visit_predict_score: float
    timing_score: float
    updated_at: datetime


@dataclass
class UnifiedCustomer:
    unified_id: int
    canonical_name: str
    email: str | None
    phone: str | None
    birth_date: date | None
    prefecture: str | None
    churn_label: ChurnLabel | None = None
    scores: list[CustomerScore] = field(default_factory=list)

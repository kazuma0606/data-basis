import json
from datetime import date, datetime

from app.domain.entities.customer import ChurnLabel, CustomerScore, UnifiedCustomer
from app.domain.exceptions import NotFoundError
from app.interfaces.clients.cache_client import ICacheClient
from app.interfaces.repositories.customer_repository import ICustomerRepository

_CACHE_TTL = 86400  # 24時間（日次バッチと合わせる）


def _cache_key(unified_id: int) -> str:
    return f"customer:{unified_id}"


def _to_json(customer: UnifiedCustomer) -> str:
    def _default(obj: object) -> str:
        if isinstance(obj, date | datetime):
            return obj.isoformat()
        raise TypeError(f"Not serializable: {type(obj)}")

    return json.dumps(
        {
            "unified_id": customer.unified_id,
            "canonical_name": customer.canonical_name,
            "email": customer.email,
            "phone": customer.phone,
            "birth_date": customer.birth_date.isoformat() if customer.birth_date else None,
            "prefecture": customer.prefecture,
            "churn_label": {
                "unified_id": customer.churn_label.unified_id,
                "label": customer.churn_label.label,
                "last_purchase_at": customer.churn_label.last_purchase_at.isoformat()
                if customer.churn_label.last_purchase_at
                else None,
                "days_since_purchase": customer.churn_label.days_since_purchase,
                "updated_at": customer.churn_label.updated_at.isoformat(),
            }
            if customer.churn_label
            else None,
            "scores": [
                {
                    "unified_id": s.unified_id,
                    "category_id": s.category_id,
                    "affinity_score": s.affinity_score,
                    "churn_risk_score": s.churn_risk_score,
                    "visit_predict_score": s.visit_predict_score,
                    "timing_score": s.timing_score,
                    "updated_at": s.updated_at.isoformat(),
                }
                for s in customer.scores
            ],
        },
        default=_default,
    )


def _from_json(data: str) -> UnifiedCustomer:
    d = json.loads(data)
    churn_label: ChurnLabel | None = None
    if d["churn_label"]:
        cl = d["churn_label"]
        churn_label = ChurnLabel(
            unified_id=cl["unified_id"],
            label=cl["label"],
            last_purchase_at=datetime.fromisoformat(cl["last_purchase_at"])
            if cl["last_purchase_at"]
            else None,
            days_since_purchase=cl["days_since_purchase"],
            updated_at=datetime.fromisoformat(cl["updated_at"]),
        )
    scores = [
        CustomerScore(
            unified_id=s["unified_id"],
            category_id=s["category_id"],
            affinity_score=s["affinity_score"],
            churn_risk_score=s["churn_risk_score"],
            visit_predict_score=s["visit_predict_score"],
            timing_score=s["timing_score"],
            updated_at=datetime.fromisoformat(s["updated_at"]),
        )
        for s in d["scores"]
    ]
    return UnifiedCustomer(
        unified_id=d["unified_id"],
        canonical_name=d["canonical_name"],
        email=d["email"],
        phone=d["phone"],
        birth_date=date.fromisoformat(d["birth_date"]) if d["birth_date"] else None,
        prefecture=d["prefecture"],
        churn_label=churn_label,
        scores=scores,
    )


class GetCustomerUseCase:
    def __init__(self, repo: ICustomerRepository, cache: ICacheClient | None = None) -> None:
        self._repo = repo
        self._cache = cache

    async def execute(self, unified_id: int) -> UnifiedCustomer:
        # cache-aside: Redis から先に取得
        if self._cache is not None:
            cached = await self._cache.get(_cache_key(unified_id))
            if cached is not None:
                return _from_json(cached)

        customer = await self._repo.find_by_id(unified_id)
        if customer is None:
            raise NotFoundError("Customer", unified_id)

        # キャッシュに書き込み
        if self._cache is not None:
            await self._cache.set(
                _cache_key(unified_id), _to_json(customer), ttl_seconds=_CACHE_TTL
            )

        return customer

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.dependencies import (
    get_analytics_repository,
    get_cache_client,
    get_customer_repository,
    get_llm_client,
    get_product_repository,
    require_business_role,
)
from app.domain.entities.user import AuthUser
from app.interfaces.clients.cache_client import ICacheClient
from app.interfaces.clients.llm_client import ILLMClient
from app.interfaces.repositories.analytics_repository import IAnalyticsRepository
from app.interfaces.repositories.customer_repository import ICustomerRepository
from app.interfaces.repositories.product_repository import IProductRepository
from app.presentation.schemas.business import (
    CategoryAffinitySchema,
    CustomerDetailSchema,
    CustomerListResponse,
    CustomerScoreSchema,
    CustomerSummarySchema,
    ChurnLabelSchema,
    KpiSummarySchema,
    NLQueryRequest,
    NLQueryResponse,
    ProductRecommendationSchema,
    SalesByChannelSchema,
    SegmentSummarySchema,
    SegmentTrendSchema,
)
from app.use_cases.business.get_affinity import GetAffinityUseCase
from app.use_cases.business.get_customer import GetCustomerUseCase
from app.use_cases.business.get_recommendations import GetRecommendationsUseCase
from app.use_cases.business.get_sales_analytics import GetSalesAnalyticsUseCase
from app.use_cases.business.get_segment_summary import GetSegmentSummaryUseCase
from app.use_cases.business.get_segment_trend import GetSegmentTrendUseCase
from app.use_cases.business.get_summary import GetSummaryUseCase
from app.use_cases.business.list_customers import ListCustomersUseCase
from app.use_cases.business.natural_language_query import NaturalLanguageQueryUseCase

router = APIRouter(prefix="/business", tags=["business"])

BusinessUser = Annotated[AuthUser, Depends(require_business_role)]


# ── KPIサマリ ─────────────────────────────────────────────────

@router.get("/summary", response_model=KpiSummarySchema)
async def get_summary(
    _: BusinessUser,
    analytics: Annotated[IAnalyticsRepository, Depends(get_analytics_repository)],
) -> KpiSummarySchema:
    result = await GetSummaryUseCase(analytics).execute()
    return KpiSummarySchema(
        active_customers=result.active_customers,
        dormant_customers=result.dormant_customers,
        churned_customers=result.churned_customers,
        churn_rate=result.churn_rate,
        weekly_revenue=result.weekly_revenue,
    )


# ── 顧客一覧・詳細 ────────────────────────────────────────────

@router.get("/customers", response_model=CustomerListResponse)
async def list_customers(
    current_user: BusinessUser,
    customer_repo: Annotated[ICustomerRepository, Depends(get_customer_repository)],
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> CustomerListResponse:
    result = await ListCustomersUseCase(customer_repo).execute(
        current_user=current_user,
        offset=offset,
        limit=limit,
    )
    items = [
        CustomerSummarySchema(
            unified_id=c.unified_id,
            canonical_name=c.canonical_name,
            email=c.email,
            phone=c.phone,
            prefecture=c.prefecture,
            churn_label=c.churn_label.label if c.churn_label else None,
        )
        for c in result.items
    ]
    return CustomerListResponse(
        items=items,
        total=result.total,
        offset=result.offset,
        limit=result.limit,
    )


@router.get("/customers/{unified_id}", response_model=CustomerDetailSchema)
async def get_customer(
    unified_id: int,
    _: BusinessUser,
    customer_repo: Annotated[ICustomerRepository, Depends(get_customer_repository)],
    cache: Annotated[ICacheClient, Depends(get_cache_client)],
) -> CustomerDetailSchema:
    customer = await GetCustomerUseCase(customer_repo, cache).execute(unified_id)
    return CustomerDetailSchema(
        unified_id=customer.unified_id,
        canonical_name=customer.canonical_name,
        email=customer.email,
        phone=customer.phone,
        birth_date=customer.birth_date,
        prefecture=customer.prefecture,
        churn_label=ChurnLabelSchema(
            label=customer.churn_label.label,
            last_purchase_at=customer.churn_label.last_purchase_at,
            days_since_purchase=customer.churn_label.days_since_purchase,
            updated_at=customer.churn_label.updated_at,
        ) if customer.churn_label else None,
        scores=[
            CustomerScoreSchema(
                category_id=s.category_id,
                affinity_score=s.affinity_score,
                churn_risk_score=s.churn_risk_score,
                visit_predict_score=s.visit_predict_score,
                timing_score=s.timing_score,
                updated_at=s.updated_at,
            )
            for s in customer.scores
        ],
    )


# ── レコメンデーション ─────────────────────────────────────────

@router.get("/customers/{unified_id}/recommendations", response_model=list[ProductRecommendationSchema])
async def get_recommendations(
    unified_id: int,
    _: BusinessUser,
    customer_repo: Annotated[ICustomerRepository, Depends(get_customer_repository)],
    product_repo: Annotated[IProductRepository, Depends(get_product_repository)],
    llm: Annotated[ILLMClient, Depends(get_llm_client)],
    limit: int = Query(10, ge=1, le=50),
) -> list[ProductRecommendationSchema]:
    results = await GetRecommendationsUseCase(customer_repo, product_repo, llm).execute(
        unified_id=unified_id,
        limit=limit,
    )
    return [
        ProductRecommendationSchema(
            unified_product_id=r.unified_product_id,
            name=r.name,
            brand=r.brand,
            price=r.price,
            category_id=r.category_id,
            similarity=r.similarity,
        )
        for r in results
    ]


# ── セグメント分析 ────────────────────────────────────────────

@router.get("/segments/summary", response_model=list[SegmentSummarySchema])
async def segment_summary(
    _: BusinessUser,
    analytics: Annotated[IAnalyticsRepository, Depends(get_analytics_repository)],
) -> list[SegmentSummarySchema]:
    items = await GetSegmentSummaryUseCase(analytics).execute()
    return [SegmentSummarySchema(label=i.label, count=i.count, percentage=i.percentage) for i in items]


@router.get("/segments/trend", response_model=list[SegmentTrendSchema])
async def segment_trend(
    _: BusinessUser,
    analytics: Annotated[IAnalyticsRepository, Depends(get_analytics_repository)],
    weeks: int = Query(12, ge=1, le=52),
) -> list[SegmentTrendSchema]:
    items = await GetSegmentTrendUseCase(analytics).execute(weeks=weeks)
    return [
        SegmentTrendSchema(
            week=i.week,
            label=i.label,
            customer_count=i.customer_count,
            avg_days_since_purchase=i.avg_days_since_purchase,
        )
        for i in items
    ]


# ── 売上・親和性分析 ──────────────────────────────────────────

@router.get("/analytics/sales", response_model=list[SalesByChannelSchema])
async def sales_analytics(
    current_user: BusinessUser,
    analytics: Annotated[IAnalyticsRepository, Depends(get_analytics_repository)],
    days: int = Query(30, ge=1, le=365),
) -> list[SalesByChannelSchema]:
    from app.domain.value_objects.role import Role
    store_id = current_user.store_id if current_user.role == Role.STORE_MANAGER else None
    items = await GetSalesAnalyticsUseCase(analytics).execute(days=days, store_id=store_id)
    return [
        SalesByChannelSchema(
            date=i.date,
            channel=i.channel,
            store_id=i.store_id,
            category_id=i.category_id,
            total_amount=i.total_amount,
            order_count=i.order_count,
            customer_count=i.customer_count,
        )
        for i in items
    ]


@router.get("/analytics/affinity", response_model=list[CategoryAffinitySchema])
async def affinity_analytics(
    _: BusinessUser,
    analytics: Annotated[IAnalyticsRepository, Depends(get_analytics_repository)],
    weeks: int = Query(4, ge=1, le=52),
    category_id: int | None = Query(None),
) -> list[CategoryAffinitySchema]:
    items = await GetAffinityUseCase(analytics).execute(weeks=weeks, category_id=category_id)
    return [
        CategoryAffinitySchema(
            week=i.week,
            category_id=i.category_id,
            age_group=i.age_group,
            gender=i.gender,
            avg_score=i.avg_score,
            customer_count=i.customer_count,
        )
        for i in items
    ]


# ── 自然言語クエリ ─────────────────────────────────────────────

@router.post("/query", response_model=NLQueryResponse)
async def natural_language_query(
    body: NLQueryRequest,
    _: BusinessUser,
    llm: Annotated[ILLMClient, Depends(get_llm_client)],
) -> NLQueryResponse:
    answer = await NaturalLanguageQueryUseCase(llm).execute(body.query)
    return NLQueryResponse(query=body.query, answer=answer)

from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies import (
    get_health_check_use_case,
    get_job_repository,
    get_kafka_admin_client,
    get_schema_repository,
    require_ops_role,
)
from app.domain.entities.user import AuthUser
from app.interfaces.clients.kafka_client import IKafkaAdminClient
from app.interfaces.repositories.job_repository import IJobRepository
from app.interfaces.repositories.schema_repository import ISchemaRepository
from app.presentation.schemas.ops import (
    BatchInfoSchema,
    ColumnInfoSchema,
    ConsumerGroupSchema,
    HealthResponse,
    JobInfoSchema,
    ServiceHealthSchema,
    TableSchemaResponse,
    TopicInfoSchema,
)
from app.use_cases.ops.get_consumer_groups import GetConsumerGroupsUseCase
from app.use_cases.ops.get_kafka_topics import GetKafkaTopicsUseCase
from app.use_cases.ops.get_pipeline_jobs import GetPipelineJobsUseCase
from app.use_cases.ops.get_schema_tables import GetSchemaTablesUseCase
from app.use_cases.ops.get_scoring_batches import GetScoringBatchesUseCase
from app.use_cases.ops.health_check import HealthCheckUseCase

router = APIRouter(prefix="/ops", tags=["ops"])

# すべての ops エンドポイントに ops ロールを要求
OpsUser = Annotated[AuthUser, Depends(require_ops_role)]


@router.get("/health", response_model=HealthResponse)
async def health(
    _: OpsUser,
    use_case: Annotated[HealthCheckUseCase, Depends(get_health_check_use_case)],
) -> HealthResponse:
    result = await use_case.execute()
    return HealthResponse(
        overall=result.overall,
        services=[
            ServiceHealthSchema(name=s.name, status=s.status, error=s.error)
            for s in result.services
        ],
    )


@router.get("/kafka/topics", response_model=list[TopicInfoSchema])
async def kafka_topics(
    _: OpsUser,
    kafka: Annotated[IKafkaAdminClient, Depends(get_kafka_admin_client)],
) -> list[TopicInfoSchema]:
    topics = await GetKafkaTopicsUseCase(kafka).execute()
    return [
        TopicInfoSchema(name=t.name, partitions=t.partitions, message_count=t.message_count)
        for t in topics
    ]


@router.get("/kafka/consumer-groups", response_model=list[ConsumerGroupSchema])
async def kafka_consumer_groups(
    _: OpsUser,
    kafka: Annotated[IKafkaAdminClient, Depends(get_kafka_admin_client)],
) -> list[ConsumerGroupSchema]:
    groups = await GetConsumerGroupsUseCase(kafka).execute()
    return [ConsumerGroupSchema(group_id=g.group_id, state=g.state) for g in groups]


@router.get("/pipeline/jobs", response_model=list[JobInfoSchema])
async def pipeline_jobs(
    _: OpsUser,
    job_repo: Annotated[IJobRepository, Depends(get_job_repository)],
) -> list[JobInfoSchema]:
    jobs = await GetPipelineJobsUseCase(job_repo).execute()
    return [JobInfoSchema(**vars(j)) for j in jobs]


@router.get("/scoring/batches", response_model=list[BatchInfoSchema])
async def scoring_batches(
    _: OpsUser,
    job_repo: Annotated[IJobRepository, Depends(get_job_repository)],
) -> list[BatchInfoSchema]:
    batches = await GetScoringBatchesUseCase(job_repo).execute()
    return [BatchInfoSchema(**vars(b)) for b in batches]


@router.get("/schema/tables", response_model=list[TableSchemaResponse])
async def schema_tables(
    _: OpsUser,
    schema_repo: Annotated[ISchemaRepository, Depends(get_schema_repository)],
) -> list[TableSchemaResponse]:
    tables = await GetSchemaTablesUseCase(schema_repo).execute()
    return [
        TableSchemaResponse(
            table_name=t.table_name,
            columns=[ColumnInfoSchema(**vars(c)) for c in t.columns],
        )
        for t in tables
    ]

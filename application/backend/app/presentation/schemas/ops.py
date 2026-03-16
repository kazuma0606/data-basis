from datetime import datetime

from pydantic import BaseModel


class ServiceHealthSchema(BaseModel):
    name: str
    status: str
    error: str | None = None


class HealthResponse(BaseModel):
    overall: str
    services: list[ServiceHealthSchema]


class TopicInfoSchema(BaseModel):
    name: str
    partitions: int
    message_count: int


class ConsumerGroupSchema(BaseModel):
    group_id: str
    state: str


class JobInfoSchema(BaseModel):
    id: int
    job_name: str
    status: str
    started_at: datetime
    finished_at: datetime | None
    records_processed: int | None
    error_message: str | None


class BatchInfoSchema(BaseModel):
    id: int
    batch_type: str
    status: str
    started_at: datetime
    finished_at: datetime | None
    records_processed: int | None
    next_run_at: datetime | None


class ColumnInfoSchema(BaseModel):
    name: str
    data_type: str
    nullable: bool
    default: str | None


class TableSchemaResponse(BaseModel):
    table_name: str
    columns: list[ColumnInfoSchema]

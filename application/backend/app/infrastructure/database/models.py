from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    store_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class PipelineJobModel(Base):
    """ETL パイプラインの実行履歴"""

    __tablename__ = "pipeline_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # running / success / failed
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    records_processed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class ScoringBatchModel(Base):
    """スコアリングバッチの実行履歴"""

    __tablename__ = "scoring_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # category_affinity / churn_risk / purchase_timing / visit_prediction
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    records_processed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


# ── 統合層 ────────────────────────────────────────────────────


class UnifiedCustomerModel(Base):
    """名寄せ・クレンジング済みの統合顧客マスタ"""

    __tablename__ = "unified_customers"

    unified_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name_kanji: Mapped[str | None] = mapped_column(String(100), nullable=True)
    name_kana: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    prefecture: Mapped[str | None] = mapped_column(String(10), nullable=True)
    resolution_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class CustomerIdMapModel(Base):
    """顧客IDマッピング（EC/POS/アプリ → unified_id）"""

    __tablename__ = "customer_id_map"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    unified_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    source_system: Mapped[str] = mapped_column(String(10), nullable=False)  # ec / pos / app
    source_id: Mapped[str] = mapped_column(String(100), nullable=False)
    match_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    matched_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class UnifiedProductModel(Base):
    """統合商品マスタ（pgvectorのembeddingカラムはraw SQLでアクセス）"""

    __tablename__ = "unified_products"

    unified_product_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(100), nullable=True)
    price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # embeddingカラム(VECTOR(768))はpgvectorのため raw SQL で扱う


# ── スコアリング層 ───────────────────────────────────────────


class ChurnLabelModel(Base):
    """チャーンラベル（active / dormant / churned）"""

    __tablename__ = "churn_labels"

    unified_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(20), nullable=False)
    last_purchase_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    days_since_purchase: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class CustomerScoreModel(Base):
    """カテゴリ別スコア（日次/週次バッチで更新）"""

    __tablename__ = "customer_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    unified_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    category_id: Mapped[int] = mapped_column(Integer, nullable=False)
    affinity_score: Mapped[float] = mapped_column(Float, nullable=False)
    churn_risk_score: Mapped[float] = mapped_column(Float, nullable=False)
    visit_predict_score: Mapped[float] = mapped_column(Float, nullable=False)
    timing_score: Mapped[float] = mapped_column(Float, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    batch_run_date: Mapped[date | None] = mapped_column(Date, nullable=True)

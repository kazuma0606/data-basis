# ============================================================
# Technomart LocalStack Terraform 設定
#
# ローカル(k3s): LocalStack 経由でリソース管理
# 本番(AWS):     provider "aws" ブロックの endpoint_* 設定を削除するだけで移行可能
#
# 使い方:
#   cd infrastructure/terraform/localstack
#   terraform init
#   terraform plan
#   terraform apply
# ============================================================

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  # LocalStack 設定（本番移行時はこのブロックを削除）
  access_key = "test"
  secret_key = "test"

  endpoints {
    s3  = var.localstack_endpoint
    iam = var.localstack_endpoint
    sts = var.localstack_endpoint
  }

  # LocalStack は SSL を使わない
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true
}

# ── S3 バケット ───────────────────────────────────────────────

resource "aws_s3_bucket" "datalake" {
  bucket = "${var.project}-datalake"

  tags = {
    Project     = var.project
    Environment = "local"
    Purpose     = "main-datalake-logs-etl-output-model-artifacts"
  }
}

resource "aws_s3_bucket" "raw" {
  bucket = "${var.project}-raw"

  tags = {
    Project     = var.project
    Environment = "local"
    Purpose     = "kafka-raw-data-immutable"
  }
}

resource "aws_s3_bucket" "aggregated" {
  bucket = "${var.project}-aggregated"

  tags = {
    Project     = var.project
    Environment = "local"
    Purpose     = "aggregated-data-clickhouse-etl-source"
  }
}

resource "aws_s3_bucket" "models" {
  bucket = "${var.project}-models"

  tags = {
    Project     = var.project
    Environment = "local"
    Purpose     = "ml-models-embeddings-artifacts"
  }
}

# ── バケットバージョニング（本番相当の設定） ──────────────────

resource "aws_s3_bucket_versioning" "raw" {
  bucket = aws_s3_bucket.raw.id
  versioning_configuration {
    status = "Enabled"
  }
}

# ── 出力 ──────────────────────────────────────────────────────

output "bucket_datalake" {
  value = aws_s3_bucket.datalake.bucket
}

output "bucket_raw" {
  value = aws_s3_bucket.raw.bucket
}

output "bucket_aggregated" {
  value = aws_s3_bucket.aggregated.bucket
}

output "bucket_models" {
  value = aws_s3_bucket.models.bucket
}

variable "localstack_endpoint" {
  description = "LocalStack エンドポイント URL（VM NodePort 経由）"
  type        = string
  default     = "http://192.168.56.10:31566"
}

variable "aws_region" {
  description = "AWS リージョン（LocalStack はダミー値でよい）"
  type        = string
  default     = "ap-northeast-1"
}

variable "project" {
  description = "プロジェクト名（S3 バケット名プレフィックス）"
  type        = string
  default     = "technomart"
}

"""
LocalStack S3 へ生成CSVをアップロード
s3://technomart-datalake/raw/<category>/<filename>.csv
"""
from pathlib import Path
import boto3
from config import S3, DATA_DIR

OUT = Path(DATA_DIR)

# アップロード先のパス分類
UPLOAD_MAP = {
    "raw/ec/":        ["ec_customers.csv", "ec_orders.csv", "ec_order_items.csv", "ec_browsing_events.csv"],
    "raw/pos/":       ["pos_members.csv", "pos_transactions.csv", "pos_transaction_items.csv", "pos_store_visits.csv"],
    "raw/app/":       ["app_users.csv", "app_events.csv"],
    "raw/master/":    [],  # 将来: master_products.csv 等
    "cleaned/":       ["unified_customers.csv", "customer_source_map.csv", "churn_labels.csv"],
}


def main():
    print("[s3] LocalStack S3 に接続中...")
    s3 = boto3.client(
        "s3",
        endpoint_url=S3["endpoint_url"],
        region_name=S3["region_name"],
        aws_access_key_id=S3["aws_access_key_id"],
        aws_secret_access_key=S3["aws_secret_access_key"],
    )

    bucket = S3["bucket"]

    # バケット作成（存在しない場合）
    try:
        s3.head_bucket(Bucket=bucket)
    except Exception:
        s3.create_bucket(
            Bucket=bucket,
            CreateBucketConfiguration={"LocationConstraint": S3["region_name"]},
        )
        print(f"  バケット作成: s3://{bucket}")

    total = 0
    for prefix, files in UPLOAD_MAP.items():
        for filename in files:
            local_path = OUT / filename
            if not local_path.exists():
                print(f"  スキップ（ファイルなし）: {filename}")
                continue
            key = prefix + filename
            s3.upload_file(str(local_path), bucket, key)
            size_mb = local_path.stat().st_size / 1024 / 1024
            print(f"  アップロード: s3://{bucket}/{key} ({size_mb:.1f} MB)")
            total += 1

    print(f"\n[s3] 完了: {total} ファイルをアップロードしました")


if __name__ == "__main__":
    main()

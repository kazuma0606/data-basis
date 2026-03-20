#!/bin/bash
# measure_ram.sh — RAM 計測結果を CSV に追記する
# 使い方: ./measure_ram.sh <シナリオ名> <出力CSVパス>
# 例: ./measure_ram.sh "A_idle" /vagrant/versions/v1.2.1/results_baseline.csv

SCENARIO=$1
CSV=$2
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ヘッダーがなければ書き込む
if [ ! -f "$CSV" ]; then
  echo "timestamp,scenario,node_cpu_cores,node_mem_used_mi,node_mem_capacity_mi,host_mem_total_gb,host_mem_used_gb,host_mem_available_gb" > "$CSV"
fi

# ノードメトリクス取得
NODE_LINE=$(kubectl top nodes --no-headers 2>/dev/null | head -1)
NODE_CPU=$(echo "$NODE_LINE" | awk '{print $2}' | tr -d 'm')
NODE_MEM_USED=$(echo "$NODE_LINE" | awk '{print $4}' | tr -d 'Mi')
NODE_MEM_CAP=$(kubectl get nodes --no-headers -o custom-columns="MEM:.status.capacity.memory" 2>/dev/null | head -1 | tr -d 'Ki' | awk '{printf "%d", $1/1024}')

# ホストメモリ取得（free -m の出力から）
MEM_LINE=$(free -m | grep "^Mem:")
HOST_TOTAL=$(echo "$MEM_LINE" | awk '{printf "%.1f", $2/1024}')
HOST_USED=$(echo "$MEM_LINE" | awk '{printf "%.1f", $3/1024}')
HOST_AVAIL=$(echo "$MEM_LINE" | awk '{printf "%.1f", $7/1024}')

echo "${TIMESTAMP},${SCENARIO},${NODE_CPU},${NODE_MEM_USED},${NODE_MEM_CAP},${HOST_TOTAL},${HOST_USED},${HOST_AVAIL}" >> "$CSV"
echo "[recorded] ${SCENARIO} → ${CSV}"

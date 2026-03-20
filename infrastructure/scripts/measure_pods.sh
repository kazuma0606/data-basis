#!/bin/bash
# measure_pods.sh — Pod 別 RAM 計測結果を CSV に追記する
# 使い方: ./measure_pods.sh <シナリオ名> <namespace> <出力CSVパス>
# 例: ./measure_pods.sh "A_idle" "default" /vagrant/versions/v1.2.1/results_pods.csv

SCENARIO=$1
NAMESPACE=$2
CSV=$3
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [ ! -f "$CSV" ]; then
  echo "timestamp,scenario,namespace,pod,cpu_m,mem_mi" > "$CSV"
fi

kubectl top pods -n "$NAMESPACE" --no-headers 2>/dev/null | while read -r POD CPU MEM; do
  CPU_VAL=$(echo "$CPU" | tr -d 'm')
  MEM_VAL=$(echo "$MEM" | tr -d 'Mi')
  echo "${TIMESTAMP},${SCENARIO},${NAMESPACE},${POD},${CPU_VAL},${MEM_VAL}" >> "$CSV"
done
echo "[recorded] pods in ${NAMESPACE} for ${SCENARIO} → ${CSV}"

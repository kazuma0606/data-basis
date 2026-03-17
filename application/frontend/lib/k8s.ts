/**
 * k8s API クライアント
 * Pod 内の ServiceAccount トークンを使って k8s API に直接アクセスする。
 * @kubernetes/client-node は使わず、標準 fetch + fs だけで完結する。
 *
 * NODE_EXTRA_CA_CERTS 環境変数（frontend-config ConfigMap に設定）で
 * k8s API の自己署名証明書を Node.js に信頼させる。
 */

import fs from "fs";
import type { PodInfo, PodEvent } from "./types";

const K8S_API = "https://kubernetes.default.svc.cluster.local";
const TOKEN_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/token";

function getToken(): string {
  try {
    return fs.readFileSync(TOKEN_PATH, "utf-8").trim();
  } catch {
    throw new Error("ServiceAccount トークンが見つかりません。Pod 外で実行していますか？");
  }
}

export async function k8sFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  return fetch(`${K8S_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.headers as Record<string, string>),
    },
  });
}

// ── Pod 状態のパース ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPodStatus(pod: any): string {
  const phase: string = pod.status?.phase ?? "Unknown";

  // ContainerStatuses から待機中の理由を取得（CrashLoopBackOff 等）
  const containerStatuses = pod.status?.containerStatuses ?? [];
  for (const cs of containerStatuses) {
    if (cs.state?.waiting?.reason) return cs.state.waiting.reason;
  }

  // initContainerStatuses も確認
  const initStatuses = pod.status?.initContainerStatuses ?? [];
  for (const cs of initStatuses) {
    if (cs.state?.waiting?.reason) return cs.state.waiting.reason;
  }

  if (pod.metadata?.deletionTimestamp) return "Terminating";
  return phase;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getReadyCount(pod: any): string {
  const statuses = pod.status?.containerStatuses ?? [];
  const ready = statuses.filter((cs: { ready: boolean }) => cs.ready).length;
  const total = statuses.length || 1;
  return `${ready}/${total}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRestarts(pod: any): number {
  const statuses = pod.status?.containerStatuses ?? [];
  return statuses.reduce(
    (sum: number, cs: { restartCount?: number }) => sum + (cs.restartCount ?? 0),
    0
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAge(pod: any): string {
  const creationTimestamp = pod.metadata?.creationTimestamp;
  if (!creationTimestamp) return "—";
  const diff = Date.now() - new Date(creationTimestamp).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getImage(pod: any): string {
  const image: string =
    pod.spec?.containers?.[0]?.image ?? pod.status?.containerStatuses?.[0]?.image ?? "unknown";
  // "192.168.56.10:32500/technomart-backend:v1.1-04b359d" → "technomart-backend:v1.1-04b359d"
  const parts = image.split("/");
  return parts[parts.length - 1];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMessage(pod: any): string | undefined {
  const containerStatuses = pod.status?.containerStatuses ?? [];
  for (const cs of containerStatuses) {
    const msg =
      cs.state?.waiting?.message ??
      cs.state?.terminated?.message ??
      cs.lastState?.terminated?.reason;
    if (msg) return msg;
  }
  return pod.status?.message ?? undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toPodInfo(pod: any): PodInfo {
  const msg = getMessage(pod);
  return {
    name: pod.metadata?.name ?? "unknown",
    namespace: pod.metadata?.namespace ?? "unknown",
    status: getPodStatus(pod),
    ready: getReadyCount(pod),
    restarts: getRestarts(pod),
    age: getAge(pod),
    image: getImage(pod),
    ...(msg ? { message: msg } : {}),
  };
}

// ── 一覧取得 ──────────────────────────────────────────────────

export async function listPods(namespace: string): Promise<PodInfo[]> {
  const res = await k8sFetch(`/api/v1/namespaces/${namespace}/pods`);
  if (!res.ok) throw new Error(`k8s API error: ${res.status}`);
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.items ?? []).map((pod: any) => toPodInfo(pod));
}

// ── Watch ストリーム（AsyncGenerator） ───────────────────────

export async function* watchPods(
  namespace: string,
  signal?: AbortSignal
): AsyncGenerator<PodEvent> {
  const res = await k8sFetch(
    `/api/v1/namespaces/${namespace}/pods?watch=true&resourceVersion=0`,
    { signal }
  );

  if (!res.ok || !res.body) {
    throw new Error(`k8s watch API error: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          yield {
            type: event.type as PodEvent["type"],
            pod: toPodInfo(event.object),
          };
        } catch {
          // 不正な JSON 行はスキップ
        }
      }
    }
  } finally {
    reader.cancel();
  }
}

// ── クラスターヘルス ──────────────────────────────────────────

export async function getClusterHealth(): Promise<{
  k8s_api: "ok" | "error";
  k8s_error?: string;
  pods?: { running: number; pending: number; failed: number; unknown: number };
}> {
  try {
    const res = await k8sFetch("/healthz");
    if (!res.ok) {
      return { k8s_api: "error", k8s_error: `status ${res.status}` };
    }

    const pods = await listPods("technomart");
    const counts = { running: 0, pending: 0, failed: 0, unknown: 0 };
    for (const pod of pods) {
      const s = pod.status.toLowerCase();
      if (s === "running") counts.running++;
      else if (s === "pending" || s === "containercreating") counts.pending++;
      else if (["error", "crashloopbackoff", "oomkilled", "failed"].some((x) => s.includes(x)))
        counts.failed++;
      else counts.unknown++;
    }
    return { k8s_api: "ok", pods: counts };
  } catch (e) {
    return {
      k8s_api: "error",
      k8s_error: e instanceof Error ? e.message : "unknown error",
    };
  }
}

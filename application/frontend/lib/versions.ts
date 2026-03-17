/**
 * versions/deployments.db 読み取り
 * better-sqlite3 等の依存を追加せず、child_process で sqlite3 コマンドを叩く。
 * DB ファイルは hostPath Volume 経由で /technomart/versions/deployments.db にマウントされる。
 */

import { execSync } from "child_process";
import type { DeployRecord } from "./types";

const DB_PATH = "/technomart/versions/deployments.db";

export function getCurrentDeployments(): DeployRecord[] {
  try {
    const sql = `
      SELECT environment, service, semver, git_hash, deployed_at
      FROM current_state
      ORDER BY environment, service;
    `.trim();

    const output = execSync(`sqlite3 -separator '|' "${DB_PATH}" "${sql}"`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    if (!output) return [];

    return output.split("\n").map((line) => {
      const [environment, service, semver, git_hash, deployed_at] =
        line.split("|");
      return { environment, service, semver, git_hash, deployed_at };
    });
  } catch {
    // DB が存在しない / sqlite3 コマンドがない場合は空配列を返す
    return [];
  }
}

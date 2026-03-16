import type { Role } from "./types";

/** ロール別ログイン後のデフォルトリダイレクト先 */
export const ROLE_HOME: Record<Role, string> = {
  engineer: "/ops/overview",
  marketer: "/business/summary",
  store_manager: "/business/summary",
  admin: "/ops/overview",
};

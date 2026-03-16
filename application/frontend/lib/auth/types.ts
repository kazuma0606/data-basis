export type Role = "engineer" | "marketer" | "store_manager" | "admin";

export interface AuthUser {
  userId: number;
  username: string;
  role: Role;
  storeId: number | null;
}

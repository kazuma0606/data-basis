import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserManagement } from "@/components/ops/UserManagement";
import type { UserInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  // engineer はリスト閲覧のみ（操作は admin のみ）
  if (session.role !== "admin" && session.role !== "engineer") redirect("/ops/overview");

  let users: UserInfo[] = [];
  let fetchError: string | null = null;

  try {
    users = await apiFetch<UserInfo[]>("/auth/users");
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "取得に失敗しました";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">ユーザー管理</h1>
        <p className="text-sm text-muted-foreground mt-1">
          ユーザーの作成・ロール変更・有効/無効切替（admin のみ操作可能）
        </p>
      </div>

      {fetchError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ユーザー一覧</CardTitle>
        </CardHeader>
        <CardContent>
          <UserManagement
            initialUsers={users}
            currentUserId={session.userId}
            isAdmin={session.role === "admin"}
          />
        </CardContent>
      </Card>
    </div>
  );
}

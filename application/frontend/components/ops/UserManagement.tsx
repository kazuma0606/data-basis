"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, UserCheck, UserX } from "lucide-react";
import type { UserInfo, Role } from "@/lib/types";

const ROLE_LABELS: Record<Role, string> = {
  admin: "管理者",
  engineer: "エンジニア",
  marketer: "マーケター",
  store_manager: "店長",
};

const ROLE_BADGE: Record<Role, "default" | "secondary" | "outline"> = {
  admin: "default",
  engineer: "secondary",
  marketer: "secondary",
  store_manager: "outline",
};

interface Props {
  initialUsers: UserInfo[];
  currentUserId: number;
  isAdmin: boolean;
}

export function UserManagement({ initialUsers, currentUserId, isAdmin }: Props) {
  const [users, setUsers] = useState<UserInfo[]>(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<number | null>(null); // user id being patched
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "engineer" as Role,
    store_id: "",
  });

  async function patchUser(userId: number, patch: { role?: Role; is_active?: boolean }) {
    setLoading(userId);
    setError(null);
    try {
      const res = await fetch(`/api/auth/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.detail ?? `エラー (${res.status})`);
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === userId ? (data as UserInfo) : u)));
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(null);
    }
  }

  async function createUser() {
    setCreateLoading(true);
    setCreateError(null);
    try {
      const body = {
        username: form.username,
        password: form.password,
        role: form.role,
        store_id: form.store_id ? parseInt(form.store_id, 10) : null,
      };
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data?.detail ?? `エラー (${res.status})`);
        return;
      }
      setUsers((prev) => [...prev, data as UserInfo]);
      setCreateOpen(false);
      setForm({ username: "", password: "", role: "engineer", store_id: "" });
    } catch {
      setCreateError("通信エラーが発生しました");
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ツールバー */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{users.length} ユーザー</p>
        {isAdmin && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <Plus className="h-4 w-4" />
              ユーザー追加
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>新規ユーザー作成</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="username">ユーザー名</Label>
                <Input
                  id="username"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="例: tanaka.hiroshi"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">初期パスワード</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="8文字以上推奨"
                />
              </div>
              <div className="space-y-1">
                <Label>ロール</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ROLE_LABELS) as [Role, string][]).map(([val, label]) => (
                      <SelectItem key={val} value={val}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.role === "store_manager" && (
                <div className="space-y-1">
                  <Label htmlFor="store_id">店舗 ID</Label>
                  <Input
                    id="store_id"
                    type="number"
                    value={form.store_id}
                    onChange={(e) => setForm((f) => ({ ...f, store_id: e.target.value }))}
                    placeholder="例: 1"
                  />
                </div>
              )}
              {createError && (
                <p className="text-sm text-destructive">{createError}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                キャンセル
              </Button>
              <Button
                onClick={createUser}
                disabled={createLoading || !form.username || !form.password}
              >
                {createLoading ? "作成中..." : "作成"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ユーザー一覧テーブル */}
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-muted-foreground">ユーザー名</TableHead>
            <TableHead className="text-muted-foreground">ロール</TableHead>
            <TableHead className="text-muted-foreground">店舗 ID</TableHead>
            <TableHead className="text-muted-foreground">状態</TableHead>
            <TableHead className="text-muted-foreground text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            const isPatching = loading === user.id;
            return (
              <TableRow key={user.id} className="border-border">
                <TableCell className="font-medium text-foreground">
                  {user.username}
                  {isSelf && (
                    <span className="ml-2 text-xs text-muted-foreground">(自分)</span>
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value={user.role}
                    disabled={!isAdmin || isSelf || isPatching}
                    onValueChange={(v) => patchUser(user.id, { role: v as Role })}
                  >
                    <SelectTrigger className="h-7 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(ROLE_LABELS) as [Role, string][]).map(([val, label]) => (
                        <SelectItem key={val} value={val} className="text-xs">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {user.store_id ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={user.is_active ? "default" : "secondary"}>
                    {user.is_active ? "有効" : "無効"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!isAdmin || isSelf || isPatching}
                    className="h-7 px-2 gap-1 text-xs"
                    onClick={() => patchUser(user.id, { is_active: !user.is_active })}
                  >
                    {user.is_active ? (
                      <>
                        <UserX className="h-3 w-3" />
                        無効化
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-3 w-3" />
                        有効化
                      </>
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

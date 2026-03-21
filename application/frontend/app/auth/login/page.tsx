"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Role } from "@/lib/auth/types";
import { ROLE_HOME } from "@/lib/auth/routes";
import {
  AUTH_CHANNEL,
  SESSION_USER_ID_KEY,
  SESSION_USERNAME_KEY,
} from "@/components/auth/SessionGuard";

// ── バリデーションスキーマ ─────────────────────────────────────────────────

const loginSchema = z.object({
  username: z.string().min(1, "ユーザー名を入力してください"),
  password: z.string().min(1, "パスワードを入力してください"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// ── セッション置き換え警告（useSearchParams は Suspense 内で使う必要がある） ──

function SessionReplacedBanner() {
  const searchParams = useSearchParams();
  const replacedBy = searchParams.get("reason") === "session_replaced"
    ? searchParams.get("by")
    : null;

  if (!replacedBy) return null;

  return (
    <div
      role="alert"
      className="rounded-md border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400"
    >
      別のアカウント（{replacedBy}）でログインされたため、サインアウトしました。
      再度ログインしてください。
    </div>
  );
}

// ── コンポーネント ─────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);

    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const data = await res.json();

      if (!res.ok) {
        setServerError(data.error ?? "ログインに失敗しました");
        return;
      }

      // sessionStorage にログインユーザーを記録（SessionGuard がタブ間の差異を検知するため）
      const { userId, username } = data.user ?? {};
      if (userId != null && username) {
        sessionStorage.setItem(SESSION_USER_ID_KEY, String(userId));
        sessionStorage.setItem(SESSION_USERNAME_KEY, username);

        // 他タブに通知（別ユーザーに切り替わったタブをログイン画面へ戻す）
        const channel = new BroadcastChannel(AUTH_CHANNEL);
        channel.postMessage({ type: "login", userId, username });
        channel.close();
      }

      // ロール別リダイレクト
      const role = data.user?.role as Role | undefined;
      const destination = role ? ROLE_HOME[role] : "/auth/login";
      router.push(destination);
    } catch {
      setServerError("ネットワークエラーが発生しました");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* ロゴ・タイトル */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <Database className="h-8 w-8 text-primary" />
            <span className="text-2xl font-semibold text-foreground">
              TechnoMart
            </span>
          </div>
          <Badge variant="outline" className="text-xs border-primary/50 text-primary">
            Data Platform
          </Badge>
        </div>

        {/* セッション置き換えの警告 */}
        <Suspense fallback={null}>
          <SessionReplacedBanner />
        </Suspense>

        {/* ログインカード */}
        <Card className="border-border bg-card">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl text-foreground">ログイン</CardTitle>
            <CardDescription className="text-muted-foreground">
              アカウント情報を入力してください
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              {/* サーバーエラー */}
              {serverError && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {serverError}
                </div>
              )}

              {/* ユーザー名 */}
              <div className="space-y-2">
                <Label htmlFor="username" className="text-foreground">
                  ユーザー名
                </Label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  placeholder="username"
                  aria-describedby={errors.username ? "username-error" : undefined}
                  aria-invalid={!!errors.username}
                  className="bg-input border-border text-foreground placeholder:text-muted-foreground"
                  {...register("username")}
                />
                {errors.username && (
                  <p id="username-error" className="text-xs text-destructive" role="alert">
                    {errors.username.message}
                  </p>
                )}
              </div>

              {/* パスワード */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground">
                  パスワード
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  aria-describedby={errors.password ? "password-error" : undefined}
                  aria-invalid={!!errors.password}
                  className="bg-input border-border text-foreground placeholder:text-muted-foreground"
                  {...register("password")}
                />
                {errors.password && (
                  <p id="password-error" className="text-xs text-destructive" role="alert">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* 送信ボタン */}
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                )}
                {isSubmitting ? "ログイン中..." : "ログイン"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

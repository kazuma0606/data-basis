"use client";

/**
 * SessionGuard — セッション乗っ取りを検知してログイン画面に強制リダイレクト
 *
 * 問題: tm_session クッキーはブラウザ全体で共有されるため、
 *       Tab B で別ユーザーがログインするとクッキーが上書きされ、
 *       Tab A がリロードされると別ユーザーの権限で動作してしまう（権限昇格）。
 *
 * 解決:
 *   1. マウント時に /api/auth/me を叩いて「このタブの正規ユーザー」を記憶
 *   2. タブがフォーカスを得た瞬間（visibilitychange）に再度 /api/auth/me を叩く
 *   3. userId が変わっていたら即座にログイン画面へ強制リダイレクト
 *   4. BroadcastChannel で他タブのログインを受信して即時検知（上記の補完）
 *   5. 15秒ポーリング: BroadcastChannel を逃した場合（Tab A が /auth/login に
 *      いてハンドラが消えた後に admin 再ログインなど）のフォールバック
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export const AUTH_CHANNEL = "tm_auth";
export const SESSION_USER_ID_KEY = "tm_session_user_id";
export const SESSION_USERNAME_KEY = "tm_session_username";

interface LoginBroadcast {
  type: "login";
  userId: number;
  username: string;
}

interface MeResponse {
  userId: number;
  username: string;
  role: string;
}

async function fetchMe(): Promise<MeResponse | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function redirectToLogin(username: string, router: ReturnType<typeof useRouter>) {
  sessionStorage.removeItem(SESSION_USER_ID_KEY);
  sessionStorage.removeItem(SESSION_USERNAME_KEY);
  toast.warning(
    `別のアカウント（${username}）でログインされたため、サインアウトしました。`,
    { duration: 3000 }
  );
  // サインアウト後にリダイレクト: ミドルウェアは有効なセッションがあると
  // /auth/login から /ops/overview に戻してしまうため、先にクッキーを消す必要がある
  fetch("/api/auth/signout", { method: "POST" }).finally(() => {
    setTimeout(() => {
      router.push(`/auth/login?reason=session_replaced&by=${encodeURIComponent(username)}`);
    }, 500);
  });
}

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // このタブで認証されたユーザーの userId を保持（null = まだ初期化していない）
  const expectedUserIdRef = useRef<number | null>(null);
  const redirectingRef = useRef(false);

  useEffect(() => {
    // sessionStorage はタブを閉じるまでリロードしても保持される（タブ固有）
    // ログイン時に保存した userId と現在のクッキーのユーザーを比較する

    fetchMe().then((me) => {
      if (!me) {
        router.push("/auth/login");
        return;
      }

      const storedUserId = sessionStorage.getItem(SESSION_USER_ID_KEY);

      if (storedUserId && String(me.userId) !== storedUserId) {
        // sessionStorage の userId（このタブでログインしたユーザー）と
        // 現在のクッキーのユーザーが異なる → 別ユーザーに上書きされた
        redirectingRef.current = true;
        redirectToLogin(me.username, router);
        return;
      }

      // 正規ユーザーとして確定（sessionStorage 未設定なら初回セット）
      expectedUserIdRef.current = me.userId;
      if (!storedUserId) {
        sessionStorage.setItem(SESSION_USER_ID_KEY, String(me.userId));
        sessionStorage.setItem(SESSION_USERNAME_KEY, me.username);
      }
    });

    // visibilitychange: タブに戻った瞬間にも検証
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;
      if (redirectingRef.current) return;

      const me = await fetchMe();
      if (!me) {
        redirectingRef.current = true;
        router.push("/auth/login");
        return;
      }

      const storedUserId = sessionStorage.getItem(SESSION_USER_ID_KEY);
      if (storedUserId && String(me.userId) !== storedUserId) {
        redirectingRef.current = true;
        redirectToLogin(me.username, router);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // BroadcastChannel: 他タブのログインを即時検知（補完）
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.onmessage = (event: MessageEvent<LoginBroadcast>) => {
      if (event.data?.type !== "login") return;
      if (redirectingRef.current) return;

      const storedUserId = sessionStorage.getItem(SESSION_USER_ID_KEY);
      if (storedUserId && String(event.data.userId) !== storedUserId) {
        redirectingRef.current = true;
        redirectToLogin(event.data.username, router);
      }
    };

    // ポーリング: BroadcastChannel/visibilitychange を逃した場合のフォールバック
    // （例: Tab A が /auth/login にいてハンドラが消えた後に別ユーザーがログイン）
    const POLL_INTERVAL = 15_000; // 15秒
    const pollInterval = setInterval(async () => {
      if (redirectingRef.current) return;
      const me = await fetchMe();
      if (!me) {
        redirectingRef.current = true;
        router.push("/auth/login");
        return;
      }
      const storedUserId = sessionStorage.getItem(SESSION_USER_ID_KEY);
      if (storedUserId && String(me.userId) !== storedUserId) {
        redirectingRef.current = true;
        redirectToLogin(me.username, router);
      }
    }, POLL_INTERVAL);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      channel.close();
      clearInterval(pollInterval);
    };
  }, [router]);

  return <>{children}</>;
}

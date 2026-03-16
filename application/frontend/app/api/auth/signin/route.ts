import { NextRequest, NextResponse } from "next/server";
import { authProvider } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/auth/session";

const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours (matches JWT_EXPIRE_MINUTES=480)

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "username と password は必須です" },
        { status: 400 }
      );
    }

    const { token, user } = await authProvider.signIn(username, password);

    const res = NextResponse.json({ user });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.SECURE_COOKIES !== "false",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "ログインに失敗しました";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

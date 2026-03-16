"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-md px-6">
        <h1 className="text-2xl font-semibold text-foreground">予期しないエラーが発生しました</h1>
        <p className="text-sm text-muted-foreground">
          ページの読み込み中にエラーが発生しました。再試行するか、しばらく待ってからアクセスしてください。
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">digest: {error.digest}</p>
        )}
        <Button onClick={reset} size="sm">
          再試行
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function BusinessError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[BusinessError]", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="text-center space-y-4 max-w-sm">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
        <h2 className="text-lg font-semibold text-foreground">データの取得に失敗しました</h2>
        <p className="text-sm text-muted-foreground">
          {error.message || "バックエンドとの通信中にエラーが発生しました。"}
        </p>
        <Button onClick={reset} variant="outline" size="sm">
          再試行
        </Button>
      </div>
    </div>
  );
}

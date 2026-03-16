import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TechnoMart Dashboard",
  description: "テクノマート データ基盤ダッシュボード",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className="dark">
      <body>{children}</body>
    </html>
  );
}

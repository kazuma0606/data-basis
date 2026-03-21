import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { OpsSidebar } from "@/components/ops/OpsSidebar";
import { OpsHeader } from "@/components/ops/OpsHeader";
import { SessionGuard } from "@/components/auth/SessionGuard";

export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (!user) redirect("/auth/login");

  return (
    <SessionGuard>
      <div className="min-h-screen bg-background flex flex-col">
        <OpsHeader username={user.username} />
        <div className="flex flex-1">
          <OpsSidebar />
          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </SessionGuard>
  );
}

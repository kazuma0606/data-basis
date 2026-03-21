import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { BusinessSidebar } from "@/components/business/BusinessSidebar";
import { BusinessHeader } from "@/components/business/BusinessHeader";
import { SessionGuard } from "@/components/auth/SessionGuard";

export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (!user) redirect("/auth/login");

  return (
    <SessionGuard>
      <div className="min-h-screen bg-background flex flex-col">
        <BusinessHeader username={user.username} role={user.role} />
        <div className="flex flex-1">
          <BusinessSidebar />
          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </SessionGuard>
  );
}

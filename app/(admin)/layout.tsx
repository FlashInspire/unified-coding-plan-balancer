import type { Metadata } from "next";
import { Sidebar, MobileSidebar } from "@/app/(admin)/_components/sidebar";
import { AdminProviders } from "@/app/(admin)/_components/admin-providers";

export const metadata: Metadata = {
  title: "Unified Coding Plan Balancer — Admin",
  description: "Self-hosted AI gateway management",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminProviders>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 items-center gap-3 border-b px-4 lg:px-6">
            <MobileSidebar />
            <div className="flex-1" />
          </header>
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </AdminProviders>
  );
}

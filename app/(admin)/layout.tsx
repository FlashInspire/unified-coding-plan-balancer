import type { Metadata } from "next";
import Link from "next/link";

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
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
          <Link href="/" className="font-bold">
            UCPB
          </Link>
          <div className="ml-8 flex gap-4 text-sm">
            <Link href="/providers">Providers</Link>
            <Link href="/models">Models</Link>
            <Link href="/provider-models">Provider-Models</Link>
            <Link href="/api-keys">API Keys</Link>
            <Link href="/quota">Quota</Link>
            <Link href="/logs">Logs & Usage</Link>
            <Link href="/users">Users</Link>
            <Link href="/settings">Settings</Link>
          </div>
          <div className="ml-auto">
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

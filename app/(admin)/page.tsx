import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth/nextauth";

export default async function AdminHome() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Welcome to Unified Coding Plan Balancer admin panel.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card href="/providers" label="Providers" />
        <Card href="/models" label="Models" />
        <Card href="/api-keys" label="API Keys" />
        <Card href="/logs" label="Logs & Usage" />
      </div>
    </div>
  );
}

function Card({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border p-4 hover:bg-accent transition-colors"
    >
      <div className="text-lg font-medium">{label}</div>
    </Link>
  );
}

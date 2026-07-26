import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/app/lib/admin-session";
import { AdminLogoutButton } from "@/app/admin/(protected)/logout-button";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };

const NAV = [
  { href: "/admin/dashboard", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/revenue", label: "Revenue" },
  { href: "/admin/launch", label: "Launches" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/audit-logs", label: "Audit log" },
];

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin");

  return (
    <div className="relative min-h-screen bg-[#050508] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 20% 10%, rgba(120,80,220,0.12), transparent)",
          }}
        />
      </div>

      <div className="relative flex min-h-screen">
        <aside className="hidden md:flex md:flex-col md:w-56 shrink-0 border-r border-white/[0.06] px-4 py-6">
          <Link
            href="/admin/dashboard"
            className="mb-8 flex items-center gap-2 text-sm font-black tracking-tight"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 text-xs font-black">
              X
            </span>
            <span>AssistantX</span>
            <span className="ml-1 rounded-full border border-violet-400/40 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-violet-300">
              Admin
            </span>
          </Link>

          <nav className="flex flex-col gap-1 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-white/60 hover:text-white hover:bg-white/[0.04] transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto pt-6 border-t border-white/[0.06]">
            <AdminLogoutButton />
          </div>
        </aside>

        <main className="flex-1 px-6 py-8 sm:px-8 max-w-6xl mx-auto w-full">
          <div className="md:hidden mb-6 flex items-center justify-between">
            <Link href="/admin/dashboard" className="text-sm font-black">
              AssistantX · Admin
            </Link>
            <AdminLogoutButton compact />
          </div>
          <div className="md:hidden mb-6 -mx-2 overflow-x-auto">
            <nav className="flex gap-1 px-2 text-xs">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-full border border-white/10 px-3 py-1.5 text-white/60 hover:text-white hover:border-white/20 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

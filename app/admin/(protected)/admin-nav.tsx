"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin/dashboard", label: "Overview", icon: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" },
  { href: "/admin/users", label: "Waitlist", icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.5-2.25a3 3 0 11-6 0 3 3 0 016 0zm7.5 2.25a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197A5.971 5.971 0 016 18.719M12 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" },
  { href: "/admin/auth-users", label: "Auth users", icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 0115 0v.75H4.5v-.75z" },
  { href: "/admin/revenue", label: "Revenue", icon: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" },
  { href: "/admin/launch", label: "Launches", icon: "M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.63 8.59m5.96 5.78l-5.96-5.78m0 0a14.926 14.926 0 00-5.841 2.58c-.511 3.712.847 7.19 3.502 9.845z" },
  { href: "/admin/referrals", label: "Referrals", icon: "M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" },
  { href: "/admin/analytics", label: "Analytics", icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" },
  { href: "/admin/audit-logs", label: "Audit log", icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" },
];

const svg = (d: string) => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

export function AdminSidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors ${
              active
                ? "bg-violet-500/10 text-white ring-1 ring-inset ring-violet-400/30"
                : "text-white/60 hover:text-white hover:bg-white/[0.04]"
            }`}
          >
            <span
              className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                active ? "bg-gradient-to-br from-violet-500 to-blue-500 text-white" : "text-white/50 group-hover:text-white/80"
              }`}
            >
              {svg(item.icon)}
            </span>
            <span className="flex-1">{item.label}</span>
            {active && <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.7)]" />}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Mobile top bar — sticky, always in reach, wraps instead of horizontal scroll.
 * Active pill glows with the same violet accent as the sidebar.
 */
export function AdminMobileNav() {
  const pathname = usePathname();
  return (
    <div className="md:hidden sticky top-0 z-30 -mx-6 mb-6 border-b border-white/[0.06] bg-[#050508]/85 px-4 py-3 backdrop-blur-lg">
      <div className="flex flex-wrap gap-2 text-[13px]">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 transition-all min-h-[36px] ${
                active
                  ? "border-violet-400/50 bg-violet-500/15 text-white"
                  : "border-white/10 bg-white/[0.02] text-white/65 hover:text-white hover:border-white/20"
              }`}
            >
              <span className={active ? "text-violet-300" : "text-white/50"}>
                {svg(item.icon)}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

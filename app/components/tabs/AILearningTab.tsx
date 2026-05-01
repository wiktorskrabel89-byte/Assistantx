"use client";


import { useEffect, useState } from "react";
import AdminPanel from "../AdminPanel";
import { createClient } from "@/lib/client";

function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    async function checkAdmin() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // Example: check for admin email or role
      setIsAdmin(!!user && (user.email?.endsWith("@yourdomain.com") || user.role === "admin"));
    }
    checkAdmin();
  }, []);
  return isAdmin;
}

export function AILearningTab() {
  const isAdmin = useIsAdmin();
  if (!isAdmin) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-2xl rounded-3xl border border-rose-200/80 bg-white/90 p-8 text-center shadow-[0_24px_80px_-28px_rgba(190,24,93,0.24)] backdrop-blur">
          <div className="inline-flex items-center rounded-full border border-rose-300/70 bg-rose-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700">
            Ograniczony dostep
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Tylko dla administratora</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Ten obszar zawiera narzedzia szkoleniowe AI i jest dostepny tylko dla kont z uprawnieniami administracyjnymi.
          </p>
        </div>
      </section>
    );
  }
  return <AdminPanel />;
}

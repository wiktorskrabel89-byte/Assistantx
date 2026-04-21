"use client";

import { useEffect, useState } from "react";
import AdminPanel from "../AdminPanel";

// Dummy admin check: replace with real logic (e.g. from user session)
function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    // TODO: Replace with real admin check (e.g. from Supabase user/session)
    // For now, allow admin if localStorage.admin === "1"
    setIsAdmin(typeof window !== "undefined" && localStorage.getItem("admin") === "1");
  }, []);
  return isAdmin;
}

export function AILearningTab({ dark }: { dark: boolean }) {
  const isAdmin = useIsAdmin();
  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-2xl font-bold text-rose-600">Tylko dla administratora</div>
    );
  }
  return <AdminPanel />;
}

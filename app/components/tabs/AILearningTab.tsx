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

export function AILearningTab({ dark }: { dark: boolean }) {
  const isAdmin = useIsAdmin();
  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-2xl font-bold text-rose-600">Tylko dla administratora</div>
    );
  }
  return <AdminPanel />;
}

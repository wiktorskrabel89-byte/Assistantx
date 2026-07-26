import { redirect } from "next/navigation";
import { getAdminSession } from "@/app/lib/admin-session";
import { AdminAccessForm } from "@/app/admin/access-form";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };

// The gate page. Already-authenticated admins bounce straight to /dashboard.
export default async function AdminEntry() {
  const session = await getAdminSession();
  if (session) redirect("/admin/dashboard");
  return <AdminAccessForm />;
}

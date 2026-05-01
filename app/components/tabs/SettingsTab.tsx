"use client";


import UserProfileEditor, { UserProfile } from "../UserProfileEditor";
import { createClient } from "@/lib/client";

// TODO: Replace mockProfile with real user data from Supabase or session. This is a temporary mock for UI only.
const mockProfile: UserProfile = {
  avatarUrl: "",
  displayName: "Your Name",
  email: "user@example.com",
  bio: "",
};

export function SettingsTab() {
  async function handleSave(profile: UserProfile) {
    const supabase = createClient();
    // Example: update user profile in Supabase
    const { error } = await supabase.from("profiles").upsert({
      avatar_url: profile.avatarUrl,
      display_name: profile.displayName,
      email: profile.email,
      bio: profile.bio,
    });
    if (error) {
      alert("Failed to save profile: " + error.message);
    } else {
      alert("Profile saved!");
    }
  }

  return (
    <section className="h-full min-h-0 overflow-auto bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-sky-200/60 bg-white/90 p-6 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.25)] backdrop-blur sm:p-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800">
          Ustawienia profilu
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Edit Profile</h2>
        <p className="mt-2 text-sm leading-7 text-slate-600">Zarzadzaj profilem i informacjami widocznymi w przestrzeni AssistantX.</p>
        <div className="mt-6">
          <UserProfileEditor profile={mockProfile} onSave={handleSave} />
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import UserProfileEditor, { type UserProfile } from "../UserProfileEditor";
import { createClient } from "@/lib/client";

type SaveStatus = "idle" | "saving" | "success" | "error";

export function SettingsTab() {
  const [profile, setProfile] = useState<UserProfile>({
    avatarUrl: "",
    displayName: "",
    email: "",
    bio: "",
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Load real user data from Supabase on mount
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setProfile({
        email: user.email ?? "",
        displayName:
          (user.user_metadata?.display_name as string | undefined) ??
          (user.user_metadata?.full_name as string | undefined) ??
          "",
        avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? "",
        bio: (user.user_metadata?.bio as string | undefined) ?? "",
      });
    });
  }, []);

  async function handleSave(updatedProfile: UserProfile) {
    setSaveStatus("saving");
    setErrorMessage("");
    const supabase = createClient();
    // Update auth user_metadata (display_name, bio)
    const { error: metaError } = await supabase.auth.updateUser({
      data: {
        display_name: updatedProfile.displayName,
        bio: updatedProfile.bio,
        avatar_url: updatedProfile.avatarUrl,
      },
    });
    if (metaError) {
      setErrorMessage(metaError.message);
      setSaveStatus("error");
      return;
    }
    // Also persist to the profiles table if it exists (best-effort)
    await supabase.from("profiles").upsert({
      avatar_url: updatedProfile.avatarUrl,
      display_name: updatedProfile.displayName,
      email: updatedProfile.email,
      bio: updatedProfile.bio,
    });
    setProfile(updatedProfile);
    setSaveStatus("success");
    setTimeout(() => setSaveStatus("idle"), 3000);
  }

  return (
    <section className="h-full min-h-0 overflow-auto bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-sky-200/60 bg-white/90 p-6 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.25)] backdrop-blur sm:p-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800">
          Ustawienia profilu
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Edit Profile</h2>
        <p className="mt-2 text-sm leading-7 text-slate-600">Zarządzaj profilem i informacjami widocznymi w przestrzeni AssistantX.</p>

        {saveStatus === "success" && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
            Profil zapisany pomyślnie.
          </div>
        )}
        {saveStatus === "error" && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
            Błąd: {errorMessage || "Nie udało się zapisać profilu."}
          </div>
        )}

        <div className="mt-6">
          <UserProfileEditor profile={profile} onSave={(p) => { void handleSave(p); }} />
        </div>
      </div>
    </section>
  );
}

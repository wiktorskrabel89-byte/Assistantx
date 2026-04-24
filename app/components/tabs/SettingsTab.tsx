"use client";


import UserProfileEditor, { UserProfile } from "../UserProfileEditor";
import { createClient } from "@/lib/client";

const mockProfile: UserProfile = {
  avatarUrl: "",
  displayName: "Your Name",
  email: "user@example.com",
  bio: "",
};

export function SettingsTab({ dark }: { dark: boolean }) {
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
    <div className="max-w-xl mx-auto py-8">
      <h2 className="text-2xl font-bold mb-4">Edit Profile</h2>
      <UserProfileEditor profile={mockProfile} onSave={handleSave} />
    </div>
  );
}

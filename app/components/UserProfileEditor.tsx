import React, { useState } from 'react';

export interface UserProfile {
  avatarUrl?: string;
  displayName: string;
  email: string;
  bio?: string;
}

interface UserProfileProps {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
}

export default function UserProfileEditor({ profile, onSave }: UserProfileProps) {
  const [form, setForm] = useState<UserProfile>(profile);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <label>
        Avatar URL
        <input id="avatar-url" name="avatarUrl" value={form.avatarUrl || ''} onChange={handleChange} className="input" />
      </label>
      <label>
        Display Name
        <input id="display-name" name="displayName" value={form.displayName} onChange={handleChange} className="input" required />
      </label>
      <label>
        Email
        <input id="profile-email" name="email" value={form.email} readOnly disabled className="input opacity-60 cursor-not-allowed" type="email" />
      </label>
      <label>
        Bio
        <textarea id="profile-bio" name="bio" value={form.bio || ''} onChange={handleChange} className="input" />
      </label>
      <button type="submit" className="btn btn-primary">Save Profile</button>
    </form>
  );
}

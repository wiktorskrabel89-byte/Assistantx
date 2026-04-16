"use client";

import { Settings2 } from "lucide-react";
import { TabPlaceholder } from "./TabPlaceholder";

export function SettingsTab({ dark }: { dark: boolean }) {
  return (
    <TabPlaceholder
      dark={dark}
      icon={Settings2}
      title="Ustawienia"
      description="Dostosuj preferencje i konfiguracje aplikacji."
    />
  );
}

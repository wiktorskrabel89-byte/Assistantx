"use client";

import { Bell } from "lucide-react";
import { TabPlaceholder } from "./TabPlaceholder";

export function NotificationsTab({ dark }: { dark: boolean }) {
  return (
    <TabPlaceholder
      dark={dark}
      icon={Bell}
      title="Powiadomienia"
      description="Przeglad powiadomien i aktywnosci."
    />
  );
}

"use client";

import { CodeXml } from "lucide-react";
import { TabPlaceholder } from "./TabPlaceholder";

export function ScriptsTab({ dark }: { dark: boolean }) {
  return (
    <TabPlaceholder
      dark={dark}
      icon={CodeXml}
      title="Scripts"
      description="Twórz i uruchamiaj skrypty automatyzacji."
    />
  );
}

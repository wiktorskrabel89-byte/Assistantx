"use client";

import { LibraryBig } from "lucide-react";
import { TabPlaceholder } from "./TabPlaceholder";

export function PromptLibraryTab({ dark }: { dark: boolean }) {
  return (
    <TabPlaceholder
      dark={dark}
      icon={LibraryBig}
      title="Prompt Library"
      description="Przeglądaj i zarządzaj szablonami promptów."
    />
  );
}

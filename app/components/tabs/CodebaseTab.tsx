"use client";

import { Database } from "lucide-react";
import { TabPlaceholder } from "./TabPlaceholder";

export function CodebaseTab({ dark }: { dark: boolean }) {
  return (
    <TabPlaceholder
      dark={dark}
      icon={Database}
      title="Codebase"
      description="Przegladaj i analizuj repozytorium kodu."
    />
  );
}

"use client";

import { Share2 } from "lucide-react";
import { TabPlaceholder } from "./TabPlaceholder";

export function KnowledgeExportTab({ dark }: { dark: boolean }) {
  return (
    <TabPlaceholder
      dark={dark}
      icon={Share2}
      title="Knowledge Export"
      description="Eksportuj wiedze i dane z rozmów."
    />
  );
}

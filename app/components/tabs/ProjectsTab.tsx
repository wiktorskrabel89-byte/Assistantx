"use client";

import { FolderKanban } from "lucide-react";
import { TabPlaceholder } from "./TabPlaceholder";

export function ProjectsTab({ dark }: { dark: boolean }) {
  return (
    <TabPlaceholder
      dark={dark}
      icon={FolderKanban}
      title="Projekty"
      description="Zarzadzaj projektami i plikami w jednym miejscu."
    />
  );
}

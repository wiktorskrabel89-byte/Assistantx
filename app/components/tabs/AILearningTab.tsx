"use client";

import { BrainCircuit } from "lucide-react";
import { TabPlaceholder } from "./TabPlaceholder";

export function AILearningTab({ dark }: { dark: boolean }) {
  return (
    <TabPlaceholder
      dark={dark}
      icon={BrainCircuit}
      title="AI Learning"
      description="Sledz postepy nauki AI i dostosuj modele."
    />
  );
}

"use client";

import { BookOpen } from "lucide-react";
import { TabPlaceholder } from "./TabPlaceholder";

export function LearningTab({ dark }: { dark: boolean }) {
  return (
    <TabPlaceholder
      dark={dark}
      icon={BookOpen}
      title="Learning"
      description="Materialy edukacyjne i interaktywne lekcje AI."
    />
  );
}

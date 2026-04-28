// TODO: SandboxTab: Implement full feature. Partial idea/code exists—review and complete implementation.
"use client";

import { SquareTerminal } from "lucide-react";
import { TabPlaceholder } from "./TabPlaceholder";

export function SandboxTab({ dark }: { dark: boolean }) {
  return (
    <TabPlaceholder
      dark={dark}
      icon={SquareTerminal}
      title="Sandbox"
      description="Uruchamiaj i testuj kod w izolowanym srodowisku."
    />
  );
}

"use client";

import { MarketplaceClient } from "@/app/marketplace/MarketplaceClient";

export function MarketplaceTab({ dark }: { dark: boolean }) {
  return <MarketplaceClient dark={dark} />;
}

export type MarketplaceTrustLevel = "community" | "verified" | "official";
export type MarketplaceCategory =
  | "productivity"
  | "coding"
  | "research"
  | "communication"
  | "analytics"
  | "security"
  | "other";

export type MarketplaceEntry = {
  pluginId: string;
  name: string;
  description: string;
  author: string;
  trustLevel: MarketplaceTrustLevel;
  category: MarketplaceCategory;
  version: string;
  downloads: number;
  rating: number;
  reviewCount: number;
  listedAt: string;
};

export type MarketplaceSubmission = {
  pluginId: string;
  name: string;
  description: string;
  author: string;
  category: MarketplaceCategory;
  version: string;
  repositoryUrl?: string;
  submittedAt: string;
  status: "pending_review" | "approved" | "rejected";
};

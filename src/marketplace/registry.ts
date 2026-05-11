import type { MarketplaceEntry, MarketplaceSubmission } from "@/src/marketplace/types";

class MarketplaceRegistry {
  private readonly entries = new Map<string, MarketplaceEntry>();
  private readonly submissions = new Map<string, MarketplaceSubmission>();

  list(options?: {
    category?: MarketplaceEntry["category"];
    trustLevel?: MarketplaceEntry["trustLevel"];
    limit?: number;
  }): MarketplaceEntry[] {
    let results = [...this.entries.values()];
    if (options?.category) {
      results = results.filter((e) => e.category === options.category);
    }
    if (options?.trustLevel) {
      results = results.filter((e) => e.trustLevel === options.trustLevel);
    }
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }
    return results.sort((a, b) => b.downloads - a.downloads);
  }

  get(pluginId: string): MarketplaceEntry | undefined {
    return this.entries.get(pluginId);
  }

  submit(
    data: Omit<MarketplaceSubmission, "submittedAt" | "status">,
  ): MarketplaceSubmission {
    const submission: MarketplaceSubmission = {
      ...data,
      submittedAt: new Date().toISOString(),
      status: "pending_review",
    };
    this.submissions.set(submission.pluginId, submission);
    return submission;
  }

  approve(pluginId: string, entry: Omit<MarketplaceEntry, "listedAt">): MarketplaceEntry {
    const existing = this.submissions.get(pluginId);
    if (existing) {
      this.submissions.set(pluginId, { ...existing, status: "approved" });
    }
    const listed: MarketplaceEntry = {
      ...entry,
      listedAt: new Date().toISOString(),
    };
    this.entries.set(pluginId, listed);
    return listed;
  }

  reject(pluginId: string): void {
    const existing = this.submissions.get(pluginId);
    if (existing) {
      this.submissions.set(pluginId, { ...existing, status: "rejected" });
    }
  }

  pendingSubmissions(): MarketplaceSubmission[] {
    return [...this.submissions.values()].filter((s) => s.status === "pending_review");
  }
}

export const marketplaceRegistry = new MarketplaceRegistry();

import type { MarketplaceEntry, MarketplaceSubmission } from "@/src/marketplace/types";

class MarketplaceRegistry {
  private readonly entries = new Map<string, MarketplaceEntry>();
  private readonly submissions = new Map<string, MarketplaceSubmission>();

  async list(options?: {
    category?: MarketplaceEntry["category"];
    trustLevel?: MarketplaceEntry["trustLevel"];
    limit?: number;
  }): Promise<MarketplaceEntry[]> {
    try {
      const { listMarketplaceListings, listPluginManifests } = await import(
        "@/src/core/persistence/runtime-db"
      );
      const [rows, manifests] = await Promise.all([
        listMarketplaceListings({
          category: options?.category,
          trustLevel: options?.trustLevel,
          limit: options?.limit,
        }),
        listPluginManifests({ status: "approved" }),
      ]);

      const manifestMap = new Map(manifests.map((m) => [m.plugin_id, m]));

      const mapped: MarketplaceEntry[] = rows.map((r) => {
        const mf = manifestMap.get(r.plugin_id);
        return {
          pluginId: r.plugin_id,
          name: mf?.name ?? r.plugin_id,
          description: mf?.description ?? "",
          author: mf?.author ?? "",
          trustLevel: r.trust_level,
          category: r.category as MarketplaceEntry["category"],
          version: mf?.version ?? "0.0.0",
          downloads: r.downloads,
          rating: r.rating,
          reviewCount: r.review_count,
          listedAt: (r as unknown as { listed_at: string }).listed_at,
        };
      });

      for (const e of mapped) this.entries.set(e.pluginId, e);
      return mapped;
    } catch {
      // Fall back to in-memory.
    }

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

  async get(pluginId: string): Promise<MarketplaceEntry | undefined> {
    const cached = this.entries.get(pluginId);
    if (cached) return cached;

    try {
      const { getMarketplaceListing, getPluginManifest } = await import(
        "@/src/core/persistence/runtime-db"
      );
      const [listing, mf] = await Promise.all([
        getMarketplaceListing(pluginId),
        getPluginManifest(pluginId),
      ]);
      if (!listing) return undefined;

      const entry: MarketplaceEntry = {
        pluginId: listing.plugin_id,
        name: mf?.name ?? listing.plugin_id,
        description: mf?.description ?? "",
        author: mf?.author ?? "",
        trustLevel: listing.trust_level,
        category: listing.category as MarketplaceEntry["category"],
        version: mf?.version ?? "0.0.0",
        downloads: listing.downloads,
        rating: listing.rating,
        reviewCount: listing.review_count,
        listedAt: (listing as unknown as { listed_at: string }).listed_at,
      };
      this.entries.set(pluginId, entry);
      return entry;
    } catch {
      return undefined;
    }
  }

  async submit(
    data: Omit<MarketplaceSubmission, "submittedAt" | "status">,
  ): Promise<MarketplaceSubmission> {
    const submission: MarketplaceSubmission = {
      ...data,
      submittedAt: new Date().toISOString(),
      status: "pending_review",
    };
    this.submissions.set(submission.pluginId, submission);

    try {
      const { insertMarketplaceSubmission } = await import(
        "@/src/core/persistence/runtime-db"
      );
      await insertMarketplaceSubmission({
        plugin_id: submission.pluginId,
        category: submission.category,
        repository_url: submission.repositoryUrl ?? null,
        status: "pending_review",
      });
    } catch {
      // Keep in-memory fallback.
    }

    return submission;
  }

  async approve(
    pluginId: string,
    entry: Omit<MarketplaceEntry, "listedAt">,
  ): Promise<MarketplaceEntry> {
    const existing = this.submissions.get(pluginId);
    if (existing) {
      this.submissions.set(pluginId, { ...existing, status: "approved" });
    }
    const listed: MarketplaceEntry = {
      ...entry,
      listedAt: new Date().toISOString(),
    };
    this.entries.set(pluginId, listed);

    try {
      const { upsertMarketplaceListing, updateMarketplaceSubmission } =
        await import("@/src/core/persistence/runtime-db");
      await Promise.all([
        upsertMarketplaceListing({
          plugin_id: listed.pluginId,
          trust_level: listed.trustLevel,
          category: listed.category,
          downloads: listed.downloads,
          rating: listed.rating,
          review_count: listed.reviewCount,
        }),
        updateMarketplaceSubmission(pluginId, { status: "approved" }),
      ]);
    } catch {
      // Keep in-memory fallback.
    }

    return listed;
  }

  async reject(pluginId: string): Promise<void> {
    const existing = this.submissions.get(pluginId);
    if (existing) {
      this.submissions.set(pluginId, { ...existing, status: "rejected" });
    }

    try {
      const { updateMarketplaceSubmission } = await import(
        "@/src/core/persistence/runtime-db"
      );
      await updateMarketplaceSubmission(pluginId, { status: "rejected" });
    } catch {
      // Keep in-memory fallback.
    }
  }

  async pendingSubmissions(): Promise<MarketplaceSubmission[]> {
    try {
      const { listMarketplaceSubmissions } = await import(
        "@/src/core/persistence/runtime-db"
      );
      const rows = await listMarketplaceSubmissions("pending_review");
      return rows.map((r) => ({
        pluginId: r.plugin_id,
        name: r.plugin_id,
        description: "",
        author: "",
        category: r.category as MarketplaceSubmission["category"],
        version: "0.0.0",
        repositoryUrl: r.repository_url ?? undefined,
        submittedAt: r.submitted_at,
        status: r.status,
      }));
    } catch {
      return [...this.submissions.values()].filter(
        (s) => s.status === "pending_review",
      );
    }
  }
}

export const marketplaceRegistry = new MarketplaceRegistry();

/**
 * Context Engineering — Types
 *
 * Core type definitions for the runtime context assembly system.
 * Context is the set of information injected into an AI model call.
 * These types ensure every piece of context is ranked, budgeted, and
 * attributable so that context decisions can be inspected and tuned.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Context source categories
// ─────────────────────────────────────────────────────────────────────────────

export type ContextSourceKind =
  | "conversation"     // Current conversation messages
  | "short_term_memory" // User's recent session memories
  | "episodic_memory"   // Past events/interactions
  | "semantic_memory"   // Facts and preferences
  | "procedural_memory" // Learned workflows
  | "knowledge_chunk"   // Uploaded documents / RAG
  | "workspace_state"   // Current workspace tab / editor state
  | "qa_cache"          // Previously answered similar questions
  | "agent_output"      // Output from a sub-agent
  | "system_prompt"     // Platform-injected system instructions
  | "tool_result"       // Result from a tool execution

// ─────────────────────────────────────────────────────────────────────────────
// Individual context entry
// ─────────────────────────────────────────────────────────────────────────────

export type ContextEntry = {
  /** Unique identifier within the assembled context. */
  id: string;
  /** Human-readable source label for debugging. */
  source: string;
  kind: ContextSourceKind;
  /** The raw text content that will be injected. */
  content: string;
  /**
   * Relevance score in [0, 1].  Higher = more relevant to the current query.
   * Computed by the ranking stage.
   */
  relevanceScore: number;
  /**
   * Freshness score in [0, 1].  Higher = more recent.
   * Combined with relevanceScore by the ranker.
   */
  freshnessScore: number;
  /**
   * Composite priority score used for budget-aware selection.
   * Computed as: relevanceScore * relevanceWeight + freshnessScore * freshnessWeight
   */
  priorityScore: number;
  /**
   * Estimated token count for this entry.
   * Used by the assembly stage to respect the token budget.
   */
  estimatedTokens: number;
  /** Source trust level.  Lower-trust entries may be compressed more aggressively. */
  trustLevel: "high" | "medium" | "low";
  /** ISO 8601 timestamp of the source content. */
  createdAt: string;
  /** Optional arbitrary metadata for debugging / telemetry. */
  metadata?: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Assembled context result
// ─────────────────────────────────────────────────────────────────────────────

export type AssembledContext = {
  /** Final ordered list of context entries, ready for injection. */
  entries: ContextEntry[];
  /** Total estimated tokens in the assembled context. */
  totalTokens: number;
  /** Token budget that was respected during assembly. */
  tokenBudget: number;
  /** Number of entries that were dropped due to the budget. */
  droppedEntries: number;
  /** Number of entries that were compressed. */
  compressedEntries: number;
  /** ISO 8601 timestamp when assembly completed. */
  assembledAt: string;
  /** Query used for ranking (for observability). */
  query: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Assembly configuration
// ─────────────────────────────────────────────────────────────────────────────

export type ContextAssemblyConfig = {
  /** Maximum total token budget for the assembled context. */
  tokenBudget: number;
  /** Weight for relevance score in the priority calculation (0–1). */
  relevanceWeight: number;
  /** Weight for freshness score in the priority calculation (0–1). */
  freshnessWeight: number;
  /**
   * Minimum priority score threshold.
   * Entries below this score are excluded before budget enforcement.
   */
  minPriorityScore: number;
  /** When true, low-priority entries are compressed before being dropped. */
  compressLowPriority: boolean;
  /** Minimum priority score at which compression is applied (vs. dropping). */
  compressionThreshold: number;
};

export const DEFAULT_ASSEMBLY_CONFIG: ContextAssemblyConfig = {
  tokenBudget: 8_000,
  relevanceWeight: 0.7,
  freshnessWeight: 0.3,
  minPriorityScore: 0.1,
  compressLowPriority: true,
  compressionThreshold: 0.4,
};

// ─────────────────────────────────────────────────────────────────────────────
// Retrieval query
// ─────────────────────────────────────────────────────────────────────────────

export type ContextRetrievalQuery = {
  userId: string;
  organizationId?: string | null;
  /** The natural language query to rank context against. */
  query: string;
  /** Which source kinds to include.  If empty, all are included. */
  sourceKinds?: ContextSourceKind[];
  /** Maximum entries to retrieve per source kind. */
  maxPerSource?: number;
  /** ISO 8601 lower bound for content freshness. */
  since?: string;
};

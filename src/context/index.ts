/**
 * Context Engineering — Public API
 *
 * Re-exports the primary entry points of the context assembly system.
 */

export type {
  ContextEntry,
  ContextSourceKind,
  AssembledContext,
  ContextAssemblyConfig,
  ContextRetrievalQuery,
} from "@/src/context/types";
export { DEFAULT_ASSEMBLY_CONFIG } from "@/src/context/types";
export { assembleContext, formatAssembledContext } from "@/src/context/assembly";
export { retrieveContextEntries, estimateTokens } from "@/src/context/retrieval";
export { rankContextEntries, filterByMinScore, deduplicateEntries } from "@/src/context/ranking";
export { compressEntry, compressToFit } from "@/src/context/compression";

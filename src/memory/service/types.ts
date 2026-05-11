export type MemoryLayer = "short_term" | "episodic" | "semantic" | "procedural";

export type MemoryEntry = {
  id: string;
  layer: MemoryLayer;
  userId: string;
  organizationId: string | null;
  content: string;
  score: number;
  tags: string[];
  embedding?: number[];
  createdAt: string;
  expiresAt?: string;
};

export type MemoryWriteRequest = {
  layer: MemoryLayer;
  userId: string;
  organizationId?: string | null;
  content: string;
  tags?: string[];
};

export type MemoryQuery = {
  userId: string;
  organizationId?: string | null;
  layer?: MemoryLayer;
  query?: string;
  limit?: number;
  minScore?: number;
};

export type MemorySearchResult = {
  entries: MemoryEntry[];
  totalFound: number;
};

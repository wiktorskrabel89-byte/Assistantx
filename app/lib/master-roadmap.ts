export type RoadmapMilestoneStatus = "current" | "next" | "planned";

export type RoadmapMilestone = {
  id: string;
  title: string;
  status: RoadmapMilestoneStatus;
  summary: string;
  outcomes: string[];
  dependencies?: string[];
};

export type RoadmapEpic = {
  id: string;
  title: string;
  summary: string;
};

export const MASTER_ROADMAP_ARCHITECTURE = {
  title: "Hybrid Core + Client",
  pillars: [
    {
      label: "Core Runtime",
      detail: "FastAPI sidecar, desktop runtime bridge, and Linux server handle heavy compute, local automation, telemetry, and self-healing.",
    },
    {
      label: "Clients",
      detail: "Electron is the power-user shell, while the web workspace stays lightweight and routes to cloud or trusted home runtime when needed.",
    },
    {
      label: "Sources of truth",
      detail: "Supabase owns sessions, sync, and analytics; local cache keeps UX responsive; runtime-local storage keeps heavy logs and machine-bound state.",
    },
  ],
} as const;

export const MASTER_ROADMAP_MILESTONES: RoadmapMilestone[] = [
  {
    id: "M0",
    title: "Hybrid architecture foundation",
    status: "current",
    summary: "Align runtime contracts, shared health semantics, and ownership boundaries across web, desktop, and local runtime.",
    outcomes: [
      "One health/readiness model for desktop-health, startup diagnostics, and web probes.",
      "Clear Core Runtime vs Client responsibilities for Electron, web, sidecar, and Linux runtime.",
      "Documented data ownership for Supabase, browser cache, and local runtime state.",
    ],
  },
  {
    id: "M1",
    title: "Telemetry, TTFT, and performance",
    status: "next",
    summary: "Measure click-to-response latency and remove render/polling hot spots before layering more product UX.",
    outcomes: [
      "End-to-end timings for click, UI ack, API start, runtime start, first token, and completion.",
      "Stabilized polling cadence for chat, device status, and workspace sync flows.",
      "Performance budgets for startup, first response, tab switching, and action feedback.",
    ],
    dependencies: ["M0"],
  },
  {
    id: "M2",
    title: "Onboarding and readiness UX",
    status: "planned",
    summary: "Turn startup diagnostics into product-language onboarding across desktop and workspace entry points.",
    outcomes: [
      "Expanded setup wizard and splash with connected/config-required/fallback messaging.",
      "Automatic checks for backend, sidecar, Ollama, and local models.",
      "First-action shortcuts for chat, pairing, device checks, and local model flows.",
    ],
    dependencies: ["M0", "M1"],
  },
  {
    id: "M3",
    title: "Unified feedback system",
    status: "planned",
    summary: "Ship one interaction-state language for sending, queueing, uploads, pairing, saving, and recovery.",
    outcomes: [
      "Consistent instant, intermediate, success, error, and retry feedback rules.",
      "Shared skeletons, transitions, and reduced-motion-safe animations across secondary panels.",
      "Non-blocking feedback for long-running local and cloud actions.",
    ],
    dependencies: ["M1", "M2"],
  },
  {
    id: "M4",
    title: "History, dashboard, and prompt visibility",
    status: "planned",
    summary: "Connect synced session history, runtime telemetry, and reusable prompts into one navigable control surface.",
    outcomes: [
      "Recent sessions sourced from workspace state plus Supabase sync.",
      "Dashboard metrics for response time, local-vs-cloud routing, errors, retries, and health.",
      "Favorite prompts and direct launch paths from dashboard to sessions or saved flows.",
    ],
    dependencies: ["M1", "M3"],
  },
  {
    id: "M5",
    title: "Portable configuration and recovery",
    status: "planned",
    summary: "Formalize import/export with versioning, validation, and distinct product flows for config, backup, and cloud sync.",
    outcomes: [
      "Versioned JSON format for portable config, full workspace backup, and cloud sync boundaries.",
      "Selective merge rules instead of blind overwrite during import.",
      "Optional desktop runtime preference export mapped back to the web workspace format.",
    ],
    dependencies: ["M3", "M4"],
  },
];

export const MASTER_ROADMAP_EPICS: RoadmapEpic[] = [
  {
    id: "dual-gpu",
    title: "Dual-GPU orchestration",
    summary: "Keep Electron and runtime aware of heavy local workloads, model placement, and image/code generation capacity.",
  },
  {
    id: "memory",
    title: "Memory and persistence",
    summary: "Unify long-term memory, session history, and portable backups so AssistantX can survive device changes and offline periods.",
  },
  {
    id: "self-healing",
    title: "Self-healing runtime",
    summary: "Detect degraded runtime states early, surface them clearly, and recover sidecar/runtime failures without blocking first paint.",
  },
  {
    id: "agent-system",
    title: "Agent operating model",
    summary: "Stage autonomous coding, approvals, and runtime permissions behind stable contracts instead of ad-hoc UI toggles.",
  },
  {
    id: "ttft",
    title: "Time-to-first-token",
    summary: "Treat first feedback and first token latency as a top-level product KPI across desktop and web paths.",
  },
];

export const MASTER_ROADMAP_GATES = [
  "Every milestone closes with telemetry review, smoke tests for web + desktop, and a rollback path.",
  "Telemetry from M1 feeds dashboard work in M4; onboarding in M2 reuses the shared readiness contract from M0/M1.",
  "Import/export hardening in M5 lands after the workspace state model is stabilized by M3 and M4.",
] as const;

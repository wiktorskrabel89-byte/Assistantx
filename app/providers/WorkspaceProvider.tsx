"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useWorkspaceState } from "../hooks/useWorkspaceState";
import { useWorkspaceSync } from "../hooks/useWorkspaceSync";

type WorkspaceContextValue = ReturnType<typeof useWorkspaceState> &
  ReturnType<typeof useWorkspaceSync>;

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const workspace = useWorkspaceState();
  const sync = useWorkspaceSync({
    loaded: workspace.loaded,
    state: workspace.state,
    setState: workspace.setState,
    stateRef: workspace.stateRef,
  });

  const value: WorkspaceContextValue = { ...workspace, ...sync };

  return (
    <WorkspaceContext value={value}>
      {children}
    </WorkspaceContext>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}

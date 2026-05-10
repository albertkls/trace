import { createContext, useContext } from "react";
import type { Workspace } from "@/lib/types";

export const DEFAULT_WORKSPACE_ID = "ws_default";
export const WORKSPACE_STORAGE_KEY = "trace.workspace.active";

export type WorkspaceContextValue = {
  activeWorkspaceId: string;
  setActiveWorkspaceId: (id: string) => void;
  workspaces: Workspace[];
  refreshWorkspaces: () => void;
};

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function currentWorkspaceId(): string {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE_ID;
  return window.localStorage.getItem(WORKSPACE_STORAGE_KEY) || DEFAULT_WORKSPACE_ID;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceContext");
  return ctx;
}

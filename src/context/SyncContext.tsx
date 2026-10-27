import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { forceNextPull } from "../lib/repo";
import { flushSyncQueue, getSyncStatus, onSyncStatus, startSyncEngine } from "../lib/sync";
import type { SyncStatus } from "../lib/types";

interface SyncValue extends SyncStatus {
  /** Short label for the badge. */
  label: string;
  syncNow: () => Promise<void>;
}
const SyncContext = createContext<SyncValue | null>(null);

export function labelFor(s: SyncStatus): string {
  if (s.message.startsWith("Sync failed:")) return "Sync error · see details";
  switch (s.status) {
    case "synced": return "Synced";
    case "syncing": return "Syncing…";
    case "offline": return "Offline · saved on device";
    default: return "Changes waiting to sync";
  }
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);
  const refreshTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    startSyncEngine();
    return onSyncStatus(next => {
      setStatus(next);
      // Pull in changes made on other devices once a sync pass finishes.
      if (next.status === "synced") {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = window.setTimeout(() => { forceNextPull(); void queryClient.invalidateQueries({ queryKey: ["data"] }); }, 300);
      }
    });
  }, [queryClient]);

  const syncNow = useCallback(async () => {
    await flushSyncQueue();
    forceNextPull();
    await queryClient.invalidateQueries({ queryKey: ["data"] });
  }, [queryClient]);

  const value = useMemo(() => ({ ...status, label: labelFor(status), syncNow }), [status, syncNow]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used inside SyncProvider");
  return ctx;
}

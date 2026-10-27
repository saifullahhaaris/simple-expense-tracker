import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { getCategories, getFinancialStartDay, getNotes, getProjects, getTransactions } from "../lib/repo";

// Every key starts with "data" so one invalidate refreshes everything after a sync.
function useUserId(): string | undefined {
  return useAuth().user?.id;
}

export const useTransactions = () => {
  const uid = useUserId();
  return useQuery({ queryKey: ["data", uid, "transactions"], queryFn: getTransactions, enabled: !!uid });
};
export const useCategories = () => {
  const uid = useUserId();
  return useQuery({ queryKey: ["data", uid, "categories"], queryFn: getCategories, enabled: !!uid });
};
export const useNotes = () => {
  const uid = useUserId();
  return useQuery({ queryKey: ["data", uid, "notes"], queryFn: getNotes, enabled: !!uid });
};
export const useProjects = (includeArchived = false) => {
  const uid = useUserId();
  return useQuery({ queryKey: ["data", uid, "projects", includeArchived], queryFn: () => getProjects(includeArchived), enabled: !!uid });
};
export const useFinancialStartDay = () => {
  const uid = useUserId();
  return useQuery({ queryKey: ["data", uid, "start-day"], queryFn: getFinancialStartDay, enabled: !!uid });
};

/** Call after any local write so every screen re-reads the (already updated) local copy. */
export function useRefreshData() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["data"] });
}

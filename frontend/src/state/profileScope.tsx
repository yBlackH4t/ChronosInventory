/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, type StockProfilesStateOut, type SuccessResponse } from "../lib/api";
import { api } from "../lib/apiClient";
import { clearAllTabStates } from "./tabStateCache";

const LAST_PROFILE_STORAGE_KEY = "chronos.active_profile_id";

type ProfileScopeContextValue = {
  activeProfileId: string;
  activeProfileName: string;
  profileScopeKey: string;
  restartRequired: boolean;
  backendSupportsProfiles: boolean;
  isLoading: boolean;
  refetch: () => void;
};

const DEFAULT_PROFILE_SCOPE: ProfileScopeContextValue = {
  activeProfileId: "default",
  activeProfileName: "Principal",
  profileScopeKey: "profile:default",
  restartRequired: false,
  backendSupportsProfiles: true,
  isLoading: false,
  refetch: () => undefined,
};

const ProfileScopeContext = createContext<ProfileScopeContextValue>(DEFAULT_PROFILE_SCOPE);

function getLocalStorageSafe(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readLastProfileId(): string {
  const storage = getLocalStorageSafe();
  if (!storage) return "default";
  const value = (storage.getItem(LAST_PROFILE_STORAGE_KEY) || "").trim().toLowerCase();
  return value || "default";
}

function persistProfileId(profileId: string) {
  const storage = getLocalStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(LAST_PROFILE_STORAGE_KEY, profileId);
  } catch {
    // best effort
  }
}

export function ProfileScopeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery<SuccessResponse<StockProfilesStateOut>, Error>({
    queryKey: ["stock-profiles", "scope"],
    queryFn: ({ signal }) => api.listStockProfiles({ signal }),
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const isNotFound = query.error instanceof ApiError && query.error.status === 404;
  const data = query.data?.data;
  const fallbackProfileId = readLastProfileId();
  const activeProfileId = (data?.active_profile_id || fallbackProfileId || "default").trim().toLowerCase();
  const activeProfileName = (data?.active_profile_name || "Principal").trim() || "Principal";
  const restartRequired = Boolean(data?.restart_required);

  useEffect(() => {
    if (!activeProfileId) return;
    persistProfileId(activeProfileId);
  }, [activeProfileId]);

  const previousProfileIdRef = useRef<string>(activeProfileId);

  useEffect(() => {
    const previousProfileId = previousProfileIdRef.current;
    if (!previousProfileId || previousProfileId === activeProfileId) return;

    const previousScopeKey = `profile:${previousProfileId}`;
    clearAllTabStates();
    queryClient.removeQueries({
      predicate: (cachedQuery) =>
        Array.isArray(cachedQuery.queryKey) && cachedQuery.queryKey.includes(previousScopeKey),
    });

    previousProfileIdRef.current = activeProfileId;
  }, [activeProfileId, queryClient]);

  useEffect(() => {
    previousProfileIdRef.current = activeProfileId;
  }, [activeProfileId]);

  const refetchProfiles = query.refetch;

  const value = useMemo<ProfileScopeContextValue>(
    () => ({
      activeProfileId,
      activeProfileName,
      profileScopeKey: `profile:${activeProfileId}`,
      restartRequired,
      backendSupportsProfiles: !isNotFound,
      isLoading: query.isLoading,
      refetch: () => {
        void refetchProfiles();
      },
    }),
    [activeProfileId, activeProfileName, isNotFound, query.isLoading, refetchProfiles, restartRequired]
  );

  return <ProfileScopeContext.Provider value={value}>{children}</ProfileScopeContext.Provider>;
}

export function useProfileScope(): ProfileScopeContextValue {
  return useContext(ProfileScopeContext);
}

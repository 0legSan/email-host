/* eslint-disable react-hooks/exhaustive-deps -- composed controller contexts expose stable React setters and refs that the rule cannot infer. */
import * as React from "react"
import { readApiRequestTimeoutMs } from "@/features/mail/controller/mail-controller-config"
import {
  apiFetch,
  type MailAccountDto,
  type MailPreferencesDto,
  type MailProfileDto,
  type MailSidebarOrderItem,
} from "@/lib/api-client"
import { queryKeys } from "@/lib/query-keys"
import {
  fetchCachedQuery,
  handleBackgroundRequestError,
  handleRequestError,
  isNetworkOffline,
  normalizeMailPreferences,
} from "./mail-controller-helpers"
import type { MailMutationsContext } from "./use-mail-mutations"

export function useMailDataActions(context: MailMutationsContext) {
  const {
    mailPreferencesRef,
    persistCachedBootstrapPatch,
    profilesRef,
    queryClient,
    refreshOfflineCacheStatus,
    setAccounts,
    setAccountsLoading,
    setAuthStatus,
    setErrorMessage,
    setMailPreferences,
    setOfflineModeActive,
    setProfiles,
    setProfilesLoading,
  } = context
  const loadAccounts = React.useCallback(
    async (options?: { force?: boolean }) => {
      if (isNetworkOffline()) {
        setOfflineModeActive(true)
        await refreshOfflineCacheStatus()
        return
      }

      setAccountsLoading(true)
      setErrorMessage(null)

      try {
        const data = await fetchCachedQuery(
          queryClient,
          queryKeys.accounts(),
          () =>
            apiFetch<{ accounts: MailAccountDto[] }>("/api/mail/accounts", {
              timeoutMs: readApiRequestTimeoutMs,
            }),
          {
            force: options?.force,
            retry: false,
            staleTimeMs: 60 * 1000,
          }
        )
        setAccounts(data.accounts)
        setOfflineModeActive(false)
        persistCachedBootstrapPatch({
          accounts: data.accounts,
        })
      } catch (error) {
        handleBackgroundRequestError(error, setAuthStatus)
        setOfflineModeActive(true)
      } finally {
        setAccountsLoading(false)
      }
    },
    [persistCachedBootstrapPatch, queryClient, refreshOfflineCacheStatus]
  )
  const loadProfiles = React.useCallback(
    async (options?: { force?: boolean }) => {
      if (isNetworkOffline()) {
        setOfflineModeActive(true)
        await refreshOfflineCacheStatus()
        return
      }

      setProfilesLoading(true)
      setErrorMessage(null)

      try {
        const data = await fetchCachedQuery(
          queryClient,
          queryKeys.profiles(),
          () =>
            apiFetch<{ profiles: MailProfileDto[] }>(
              "/api/mail/account-profiles",
              {
                timeoutMs: readApiRequestTimeoutMs,
              }
            ),
          {
            force: options?.force,
            retry: false,
            staleTimeMs: 60 * 1000,
          }
        )
        setProfiles(data.profiles)
        setOfflineModeActive(false)
        persistCachedBootstrapPatch({
          profiles: data.profiles,
        })
      } catch (error) {
        handleBackgroundRequestError(error, setAuthStatus)
        setOfflineModeActive(true)
      } finally {
        setProfilesLoading(false)
      }
    },
    [persistCachedBootstrapPatch, queryClient, refreshOfflineCacheStatus]
  )
  const saveSidebarOrder = React.useCallback(
    async (order: MailSidebarOrderItem[]) => {
      const previousPreferences = mailPreferencesRef.current
      const nextPreferences: MailPreferencesDto = {
        ...previousPreferences,
        sidebar: {
          order,
        },
      }

      setMailPreferences(nextPreferences)
      queryClient.setQueryData(queryKeys.preferences(), {
        preferences: nextPreferences,
      })
      persistCachedBootstrapPatch({
        preferences: nextPreferences,
      })

      try {
        const data = await apiFetch<{ preferences: MailPreferencesDto }>(
          "/api/mail/preferences/sidebar-order",
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              order,
            }),
          }
        )
        const preferences = normalizeMailPreferences(data.preferences)

        setMailPreferences(preferences)
        queryClient.setQueryData(queryKeys.preferences(), {
          preferences,
        })
        persistCachedBootstrapPatch({
          preferences,
        })
      } catch (error) {
        setMailPreferences(previousPreferences)
        queryClient.setQueryData(queryKeys.preferences(), {
          preferences: previousPreferences,
        })
        persistCachedBootstrapPatch({
          preferences: previousPreferences,
        })
        handleRequestError(error, setErrorMessage, setAuthStatus)
      }
    },
    [persistCachedBootstrapPatch, queryClient]
  )
  const saveProfileAccountOrder = React.useCallback(
    async (profileId: string, accountIds: string[]) => {
      const previousProfiles = profilesRef.current
      const nextProfiles = previousProfiles.map((profile) =>
        profile.id === profileId ? { ...profile, accountIds } : profile
      )

      setProfiles(nextProfiles)
      queryClient.setQueryData(queryKeys.profiles(), {
        profiles: nextProfiles,
      })
      persistCachedBootstrapPatch({
        profiles: nextProfiles,
      })

      try {
        const data = await apiFetch<{ profile: MailProfileDto }>(
          `/api/mail/account-profiles/${profileId}`,
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              accountIds,
            }),
          }
        )
        const profiles = profilesRef.current.map((profile) =>
          profile.id === profileId ? data.profile : profile
        )

        setProfiles(profiles)
        queryClient.setQueryData(queryKeys.profiles(), {
          profiles,
        })
        persistCachedBootstrapPatch({
          profiles,
        })
      } catch (error) {
        setProfiles(previousProfiles)
        queryClient.setQueryData(queryKeys.profiles(), {
          profiles: previousProfiles,
        })
        persistCachedBootstrapPatch({
          profiles: previousProfiles,
        })
        handleRequestError(error, setErrorMessage, setAuthStatus)
      }
    },
    [persistCachedBootstrapPatch, queryClient]
  )

  return {
    loadAccounts,
    loadProfiles,
    saveProfileAccountOrder,
    saveSidebarOrder,
  }
}

export type MailDataActionsContext = MailMutationsContext &
  ReturnType<typeof useMailDataActions>

import * as React from "react"
import {
  useQueries as useConvexQueries,
  useQuery as useConvexQuery,
} from "convex/react"
import { pageSize } from "@/features/mail/controller/mail-controller-config"
import { api } from "../../../../../../convex/_generated/api"
import {
  isNetworkOffline,
  parseMailDateBoundary,
} from "./mail-controller-helpers"
import type { MailNavigationContext } from "./use-mail-navigation"
import { isOfflineMailCursor } from "@/lib/offline-mail-query"

export function useMailQueries(context: MailNavigationContext) {
  const {
    activeMessageListNavigation,
    authStatus,
    composeOpen,
    currentMessagePageRequest,
    messageListWindowPageNumbers,
    networkOnline,
    realtimeEnabled,
    selectedMessageId,
    user,
  } = context
  const messageListQueryEnabled =
    authStatus === "authenticated" &&
    currentMessagePageRequest.accountIds?.length !== 0
  const convexQueryEnabled =
    realtimeEnabled &&
    messageListQueryEnabled &&
    networkOnline &&
    !isNetworkOffline()
  const reactiveAccounts = useConvexQuery(
    api.accounts.list,
    realtimeEnabled && authStatus === "authenticated" && networkOnline
      ? {}
      : "skip"
  )
  const reactiveMailboxes = useConvexQuery(
    api.mail.listMailboxes,
    realtimeEnabled && authStatus === "authenticated" && networkOnline
      ? {}
      : "skip"
  )
  const reactiveMessageStates = useConvexQuery(
    api.mail.listMessageStateChanges,
    realtimeEnabled && authStatus === "authenticated" && networkOnline
      ? {}
      : "skip"
  )
  const reactiveKnownContacts = useConvexQuery(
    api.mail.listKnownContacts,
    realtimeEnabled &&
      authStatus === "authenticated" &&
      networkOnline &&
      composeOpen
      ? {}
      : "skip"
  )
  const convexMessageListArgs = React.useMemo(() => {
    const after = parseMailDateBoundary(currentMessagePageRequest.after)
    const before = parseMailDateBoundary(currentMessagePageRequest.before, true)

    return {
      accountPublicIds: [
        ...(currentMessagePageRequest.accountIds ?? []),
        ...(currentMessagePageRequest.accountId
          ? [currentMessagePageRequest.accountId]
          : []),
      ],
      ...(currentMessagePageRequest.searchMode ? { searchMode: true } : {}),
      ...(currentMessagePageRequest.path
        ? { path: currentMessagePageRequest.path }
        : {}),
      ...(currentMessagePageRequest.specialUse
        ? { specialUse: currentMessagePageRequest.specialUse }
        : {}),
      ...(currentMessagePageRequest.customFolders
        ? { customFolders: true }
        : {}),
      ...(currentMessagePageRequest.q
        ? { q: currentMessagePageRequest.q }
        : {}),
      ...(currentMessagePageRequest.from
        ? { from: currentMessagePageRequest.from }
        : {}),
      ...(currentMessagePageRequest.to
        ? { to: currentMessagePageRequest.to }
        : {}),
      ...(currentMessagePageRequest.subject
        ? { subject: currentMessagePageRequest.subject }
        : {}),
      ...(after === undefined ? {} : { after }),
      ...(before === undefined ? {} : { before }),
      ...(currentMessagePageRequest.hasAttachments
        ? { hasAttachments: true }
        : {}),
      ...(currentMessagePageRequest.unread ? { unread: true } : {}),
      ...(currentMessagePageRequest.flagged ? { flagged: true } : {}),
    }
  }, [currentMessagePageRequest])
  const requestedMessageListPages = React.useMemo(
    () =>
      messageListWindowPageNumbers.flatMap((pageNumber) => {
        const cursor = activeMessageListNavigation.cursors[String(pageNumber)]

        return pageNumber === 1 || cursor !== undefined
          ? [{ pageNumber, cursor: cursor ?? null }]
          : []
      }),
    [activeMessageListNavigation.cursors, messageListWindowPageNumbers]
  )
  const convexMessageListQueries = React.useMemo(
    () =>
      convexQueryEnabled
        ? Object.fromEntries(
            requestedMessageListPages
              .filter(({ cursor }) => !isOfflineMailCursor(cursor))
              .map(({ cursor, pageNumber }) => [
                String(pageNumber),
                {
                  query: api.mail.listMessages,
                  args: {
                    ...convexMessageListArgs,
                    paginationOpts: {
                      cursor,
                      numItems: pageSize,
                    },
                  },
                },
              ])
          )
        : {},
    [convexMessageListArgs, convexQueryEnabled, requestedMessageListPages]
  )
  const reactiveMessageListPages = useConvexQueries(convexMessageListQueries)
  const reactiveSelectedMessage = useConvexQuery(
    api.mail.getMessage,
    realtimeEnabled &&
      authStatus === "authenticated" &&
      networkOnline &&
      selectedMessageId
      ? { messagePublicId: selectedMessageId }
      : "skip"
  )
  const reactiveSelectedThread = useConvexQuery(
    api.mail.getThread,
    realtimeEnabled &&
      authStatus === "authenticated" &&
      networkOnline &&
      selectedMessageId
      ? { messagePublicId: selectedMessageId }
      : "skip"
  )
  const currentUserId = user?.id

  return {
    convexMessageListArgs,
    convexMessageListQueries,
    convexQueryEnabled,
    currentUserId,
    messageListQueryEnabled,
    reactiveAccounts,
    reactiveKnownContacts,
    reactiveMailboxes,
    reactiveMessageListPages,
    reactiveMessageStates,
    reactiveSelectedMessage,
    reactiveSelectedThread,
    requestedMessageListPages,
  }
}

export type MailQueriesContext = MailNavigationContext &
  ReturnType<typeof useMailQueries>

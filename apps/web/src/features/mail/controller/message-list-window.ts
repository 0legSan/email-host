import type { MessageListWindowPage } from "./mail-controller-config"
import { isOfflineMailCursor } from "../../../lib/offline-mail-query"

export function selectConsistentMessageListPages(
  pages: MessageListWindowPage[]
) {
  const first = pages.find((page) => page.pageNumber === 1)?.data
  if (!first) return pages

  // Server and local pagination can have different membership and boundaries.
  const compatiblePages = pages.filter(
    (page) =>
      page.pageNumber === 1 ||
      isOfflineMailCursor(page.cursor) === Boolean(first.offline)
  )
  const lastPage = compatiblePages.find(
    (page) => page.data?.nextPageCursor === null
  )?.pageNumber
  return lastPage === undefined
    ? compatiblePages
    : compatiblePages.filter((page) => page.pageNumber <= lastPage)
}

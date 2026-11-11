import { useMailLocale } from "@workspace/mail-design"
import * as React from "react"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@workspace/ui/components/pagination"
import { cn } from "@workspace/ui/lib/utils"

import { compactNumber } from "@/features/mail/utils/mail-format"

type MessageListPaginationProps = {
  canGoToNextPage: boolean
  canGoToPreviousPage: boolean
  currentPage: number
  loadingMore: boolean
  pageNumbers: number[]
  requestedPage: number | null
  onNavigate: (
    event: React.MouseEvent<HTMLAnchorElement>,
    page: number,
    enabled: boolean
  ) => void
  onSelectPage: (
    event: React.MouseEvent<HTMLAnchorElement>,
    page: number
  ) => void
}

export function MessageListPagination({
  canGoToNextPage,
  canGoToPreviousPage,
  currentPage,
  loadingMore,
  pageNumbers,
  requestedPage,
  onNavigate,
  onSelectPage,
}: MessageListPaginationProps) {
  const { t } = useMailLocale()

  return (
    <div className="flex h-12 shrink-0 items-center border-t border-[#d8dee5] bg-[#f8fafb] px-2 dark:border-[#30353a] dark:bg-[#131619]">
      <Pagination
        aria-label={t("Страницы писем", "Message pages")}
        className="min-w-0"
      >
        <PaginationContent className="grid w-[17.25rem] min-w-0 grid-cols-7 gap-1">
          <PaginationItem>
            <PaginationPrevious
              aria-disabled={!canGoToPreviousPage}
              aria-label={t(
                "Предыдущая страница писем",
                "Previous message page"
              )}
              className={cn(
                "size-9 p-0 text-[#4f5b66] dark:text-[#a7b0ba]",
                !canGoToPreviousPage && "pointer-events-none opacity-35"
              )}
              href="#"
              tabIndex={canGoToPreviousPage ? undefined : -1}
              text=""
              onClick={(event) =>
                onNavigate(event, currentPage - 1, canGoToPreviousPage)
              }
            />
          </PaginationItem>
          {pageNumbers.map((page, index) => {
            const previousPage = pageNumbers[index - 1]
            const pagesOmitted =
              previousPage !== undefined && page - previousPage > 1

            return (
              <React.Fragment key={page}>
                {pagesOmitted ? (
                  <PaginationItem>
                    <PaginationEllipsis className="size-9" />
                  </PaginationItem>
                ) : null}
                <PaginationItem>
                  <PaginationLink
                    aria-busy={requestedPage === page || undefined}
                    aria-label={t(`Страница ${page}`, `Page ${page}`)}
                    className={cn(
                      "size-9 text-[#4f5b66] dark:text-[#a7b0ba]",
                      requestedPage === page && "opacity-60"
                    )}
                    href="#"
                    isActive={page === currentPage}
                    onClick={(event) => onSelectPage(event, page)}
                  >
                    {compactNumber(page)}
                  </PaginationLink>
                </PaginationItem>
              </React.Fragment>
            )
          })}
          <PaginationItem className="col-start-7">
            <PaginationNext
              aria-disabled={!canGoToNextPage || loadingMore}
              aria-label={t("Следующая страница писем", "Next message page")}
              className={cn(
                "size-9 p-0 text-[#4f5b66] dark:text-[#a7b0ba]",
                (!canGoToNextPage || loadingMore) &&
                  "pointer-events-none opacity-35"
              )}
              href="#"
              tabIndex={canGoToNextPage && !loadingMore ? undefined : -1}
              text=""
              onClick={(event) =>
                onNavigate(
                  event,
                  currentPage + 1,
                  canGoToNextPage && !loadingMore
                )
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"

import type {
  MailAccountDto,
  MailProfileDto,
  MailSidebarOrderItem,
} from "@/lib/api-client"

export type SidebarOrderableItem =
  | { type: "profile"; id: string; profile: MailProfileDto }
  | { type: "account"; id: string; account: MailAccountDto }

type DragInsertPosition = "before" | "after"
type SidebarDropIndicator =
  | { scope: "root"; targetKey: string; position: DragInsertPosition }
  | {
      scope: "profile"
      profileId: string
      targetKey: string
      position: DragInsertPosition
    }

type SidebarDndOptions = {
  orderedRootItems: SidebarOrderableItem[]
  saveProfileAccountOrder: (
    profileId: string,
    accountIds: string[]
  ) => void | Promise<void>
  saveSidebarOrder: (order: MailSidebarOrderItem[]) => void | Promise<void>
}

export function useSidebarDnd({
  orderedRootItems,
  saveProfileAccountOrder,
  saveSidebarOrder,
}: SidebarDndOptions) {
  const [draggingRootKey, setDraggingRootKey] = React.useState<string | null>(
    null
  )
  const [draggingProfileAccountKey, setDraggingProfileAccountKey] =
    React.useState<string | null>(null)
  const [dropIndicator, setDropIndicator] =
    React.useState<SidebarDropIndicator | null>(null)

  function handleRootDragOver(
    event: React.DragEvent<HTMLElement>,
    targetItem: SidebarOrderableItem
  ) {
    if (!draggingRootKey) return
    const targetKey = getSidebarOrderableItemKey(targetItem)
    event.preventDefault()
    if (draggingRootKey === targetKey) {
      setDropIndicator(null)
      return
    }
    setDropIndicator({
      scope: "root",
      targetKey,
      position: getDragInsertPosition(event),
    })
  }

  function handleRootDrop(
    event: React.DragEvent<HTMLElement>,
    targetItem: SidebarOrderableItem
  ) {
    if (!draggingRootKey) return
    const targetKey = getSidebarOrderableItemKey(targetItem)
    const position =
      dropIndicator?.scope === "root" && dropIndicator.targetKey === targetKey
        ? dropIndicator.position
        : getDragInsertPosition(event)

    if (draggingRootKey === targetKey) {
      clearRootDrag()
      return
    }

    event.preventDefault()
    const nextOrder = moveItemByKey(
      orderedRootItems,
      draggingRootKey,
      targetKey,
      getSidebarOrderableItemKey,
      position
    ).map(toSidebarOrderItem)
    clearRootDrag()
    void saveSidebarOrder(nextOrder)
  }

  function handleProfileDragOver(
    event: React.DragEvent<HTMLElement>,
    profile: MailProfileDto,
    targetAccountId: string
  ) {
    if (!draggingProfileAccountKey) return
    const sourceAccountId = readProfileAccountDragKey(
      draggingProfileAccountKey,
      profile.id
    )
    event.preventDefault()
    event.stopPropagation()
    if (!sourceAccountId || sourceAccountId === targetAccountId) {
      setDropIndicator(null)
      return
    }
    setDropIndicator({
      scope: "profile",
      profileId: profile.id,
      targetKey: targetAccountId,
      position: getDragInsertPosition(event),
    })
  }

  function handleProfileDrop(
    event: React.DragEvent<HTMLElement>,
    profile: MailProfileDto,
    targetAccountId: string
  ) {
    if (!draggingProfileAccountKey) return
    const sourceAccountId = readProfileAccountDragKey(
      draggingProfileAccountKey,
      profile.id
    )
    if (!sourceAccountId || sourceAccountId === targetAccountId) {
      clearProfileDrag()
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const position =
      dropIndicator?.scope === "profile" &&
      dropIndicator.profileId === profile.id &&
      dropIndicator.targetKey === targetAccountId
        ? dropIndicator.position
        : getDragInsertPosition(event)
    const nextAccountIds = moveStringItem(
      profile.accountIds,
      sourceAccountId,
      targetAccountId,
      position
    )
    clearProfileDrag()
    void saveProfileAccountOrder(profile.id, nextAccountIds)
  }

  function clearRootDrag() {
    setDraggingRootKey(null)
    setDropIndicator(null)
  }

  function clearProfileDrag() {
    setDraggingProfileAccountKey(null)
    setDropIndicator(null)
  }

  return {
    clearProfileDrag,
    clearRootDrag,
    draggingProfileAccountKey,
    draggingRootKey,
    dropIndicator,
    handleProfileDragOver,
    handleProfileDrop,
    handleRootDragOver,
    handleRootDrop,
    setDraggingProfileAccountKey,
    setDraggingRootKey,
    setDropIndicator,
  }
}

export function getRootDropPosition(
  indicator: SidebarDropIndicator | null,
  targetKey: string
) {
  return indicator?.scope === "root" && indicator.targetKey === targetKey
    ? indicator.position
    : null
}

export function getProfileAccountDropPosition(
  indicator: SidebarDropIndicator | null,
  profileId: string,
  targetKey: string
) {
  return indicator?.scope === "profile" &&
    indicator.profileId === profileId &&
    indicator.targetKey === targetKey
    ? indicator.position
    : null
}

export function renderDropIndicator(position: DragInsertPosition | null) {
  if (!position) return null
  return (
    <span
      aria-hidden="true"
      className={cn(
        "bg-mail-positive pointer-events-none absolute right-0 left-0 z-20 h-0.5 shadow-[0_0_0_1px_rgba(31,138,112,0.18)]",
        position === "before" ? "-top-1" : "-bottom-1"
      )}
    />
  )
}

export function sortSidebarOrderableItems(
  items: SidebarOrderableItem[],
  order: MailSidebarOrderItem[]
) {
  const itemByKey = new Map(
    items.map((item) => [getSidebarOrderableItemKey(item), item])
  )
  const orderedItems = order.flatMap((orderItem) => {
    const item = itemByKey.get(getSidebarOrderItemKey(orderItem))
    if (!item) return []
    itemByKey.delete(getSidebarOrderableItemKey(item))
    return [item]
  })
  return [...orderedItems, ...itemByKey.values()]
}

export function getSidebarOrderableItemKey(item: SidebarOrderableItem) {
  return `${item.type}:${item.id}`
}

export function getProfileAccountDragKey(profileId: string, accountId: string) {
  return `${profileId}:${accountId}`
}

function toSidebarOrderItem(item: SidebarOrderableItem): MailSidebarOrderItem {
  return { type: item.type, id: item.id }
}

function getSidebarOrderItemKey(item: MailSidebarOrderItem) {
  return `${item.type}:${item.id}`
}

function moveItemByKey<TItem>(
  items: TItem[],
  sourceKey: string,
  targetKey: string,
  getKey: (item: TItem) => string,
  position: DragInsertPosition
) {
  const nextItems = [...items]
  const sourceIndex = nextItems.findIndex((item) => getKey(item) === sourceKey)
  const sourceItem = nextItems[sourceIndex]
  if (sourceIndex < 0 || !sourceItem) return items
  nextItems.splice(sourceIndex, 1)
  const targetIndex = nextItems.findIndex((item) => getKey(item) === targetKey)
  if (targetIndex < 0) return items
  nextItems.splice(
    position === "after" ? targetIndex + 1 : targetIndex,
    0,
    sourceItem
  )
  return nextItems
}

function moveStringItem(
  items: string[],
  source: string,
  target: string,
  position: DragInsertPosition
) {
  const sourceIndex = items.indexOf(source)
  if (sourceIndex < 0) return items
  const nextItems = [...items]
  nextItems.splice(sourceIndex, 1)
  const targetIndex = nextItems.indexOf(target)
  if (targetIndex < 0) return items
  nextItems.splice(
    position === "after" ? targetIndex + 1 : targetIndex,
    0,
    source
  )
  return nextItems
}

function getDragInsertPosition(
  event: React.DragEvent<HTMLElement>
): DragInsertPosition {
  const row =
    event.currentTarget.dataset.dropGroup === "true"
      ? event.currentTarget.querySelector<HTMLElement>("[data-drop-row='true']")
      : null
  const rect = (row ?? event.currentTarget).getBoundingClientRect()
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after"
}

function readProfileAccountDragKey(value: string, profileId: string) {
  const prefix = `${profileId}:`
  return value.startsWith(prefix) ? value.slice(prefix.length) : null
}

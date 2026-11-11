import * as React from "react"

const pullToRefreshActivationDistance = 72
const pullToRefreshMaxDistance = 88

export function useEvent<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => TResult
) {
  const handlerRef = React.useRef(handler)

  React.useLayoutEffect(() => {
    handlerRef.current = handler
  })

  return React.useCallback((...args: TArgs) => handlerRef.current(...args), [])
}

export function usePullToRefresh({
  disabled = false,
  gestureElementRef,
  scrollElementRef,
  onRefresh,
}: {
  disabled?: boolean
  gestureElementRef: React.RefObject<HTMLElement | null>
  scrollElementRef: React.RefObject<HTMLElement | null>
  onRefresh: () => void | Promise<void>
}) {
  const [pullDistance, setPullDistance] = React.useState(0)
  const [pullReady, setPullReady] = React.useState(false)
  const disabledRef = React.useRef(disabled)
  const onRefreshEvent = useEvent(onRefresh)

  React.useLayoutEffect(() => {
    disabledRef.current = disabled
  }, [disabled])

  React.useEffect(() => {
    const gestureElement = gestureElementRef.current

    if (!gestureElement) {
      return
    }

    let startX = 0
    let startY = 0
    let pulling = false
    let started = false
    let startedAtTop = false
    let latestPullDistance = 0

    const resetPullState = () => {
      pulling = false
      started = false
      startedAtTop = false
      latestPullDistance = 0
      setPullDistance(0)
      setPullReady(false)
    }

    const getScrollTop = () => scrollElementRef.current?.scrollTop ?? 0

    const handleTouchStart = (event: TouchEvent) => {
      if (disabledRef.current || event.touches.length !== 1) {
        resetPullState()
        return
      }

      const touch = event.touches[0]

      startX = touch.clientX
      startY = touch.clientY
      started = true
      pulling = false
      startedAtTop = getScrollTop() <= 0
      latestPullDistance = 0
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (disabledRef.current || !started || event.touches.length !== 1) {
        return
      }

      const touch = event.touches[0]
      const deltaY = touch.clientY - startY
      const deltaX = Math.abs(touch.clientX - startX)

      if (!pulling) {
        if (!startedAtTop || deltaY <= 8 || deltaY <= deltaX) {
          return
        }

        pulling = true
      }

      if (deltaY <= 0) {
        resetPullState()
        return
      }

      event.preventDefault()

      latestPullDistance = deltaY
      setPullDistance(
        Math.min(pullToRefreshMaxDistance, Math.round(deltaY * 0.45))
      )
      setPullReady(deltaY >= pullToRefreshActivationDistance)
    }

    const handleTouchEnd = () => {
      if (!started) {
        return
      }

      const shouldRefresh =
        pulling &&
        latestPullDistance >= pullToRefreshActivationDistance &&
        !disabledRef.current

      resetPullState()

      if (shouldRefresh) {
        void onRefreshEvent()
      }
    }

    gestureElement.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    })
    gestureElement.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    })
    gestureElement.addEventListener("touchend", handleTouchEnd)
    gestureElement.addEventListener("touchcancel", resetPullState)

    return () => {
      gestureElement.removeEventListener("touchstart", handleTouchStart)
      gestureElement.removeEventListener("touchmove", handleTouchMove)
      gestureElement.removeEventListener("touchend", handleTouchEnd)
      gestureElement.removeEventListener("touchcancel", resetPullState)
    }
  }, [gestureElementRef, onRefreshEvent, scrollElementRef])

  return {
    pullDistance,
    pullReady,
  }
}

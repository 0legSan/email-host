import * as React from "react"
import { MailAppView } from "@/features/mail/mail-app-view"
import { useMailController } from "@/features/mail/controller/use-mail-controller"

type ConvexOfflineBoundaryState = { error: Error | null }

class ConvexOfflineBoundary extends React.Component<
  React.PropsWithChildren<{ fallback: React.ReactNode }>,
  ConvexOfflineBoundaryState
> {
  state: ConvexOfflineBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ConvexOfflineBoundaryState {
    return { error }
  }

  componentDidMount() {
    window.addEventListener("online", this.retryRealtime)
    window.addEventListener("pageshow", this.retryRealtime)
  }

  componentWillUnmount() {
    window.removeEventListener("online", this.retryRealtime)
    window.removeEventListener("pageshow", this.retryRealtime)
  }

  private retryRealtime = () => {
    if (this.state.error && navigator.onLine) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    if (!this.state.error.message.startsWith("[CONVEX ")) throw this.state.error
    return this.props.fallback
  }
}

export function App() {
  return (
    <ConvexOfflineBoundary fallback={<MailApp realtimeEnabled={false} />}>
      <MailApp realtimeEnabled />
    </ConvexOfflineBoundary>
  )
}

function MailApp({ realtimeEnabled }: { realtimeEnabled: boolean }) {
  const controller = useMailController({ realtimeEnabled })
  return <MailAppView controller={controller} />
}

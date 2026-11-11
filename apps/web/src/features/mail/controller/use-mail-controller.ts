import { useMailBasicActions } from "./use-mail-basic-actions"
import { useMailDataActions } from "./use-mail-data-actions"
import { useMailEffects } from "./use-mail-effects"
import { useMailMessageActions } from "./use-mail-message-actions"
import { useMailMutations } from "./use-mail-mutations"
import { useMailNavigation } from "./use-mail-navigation"
import { useMailPresentationState } from "./use-mail-presentation-state"
import { useMailQueries } from "./use-mail-queries"
import { useMailRealtime } from "./use-mail-realtime"
import { useMailUiActions } from "./use-mail-ui-actions"

export function useMailController({
  realtimeEnabled,
}: {
  realtimeEnabled: boolean
}) {
  const presentation = useMailPresentationState({ realtimeEnabled })
  const navigation = useMailNavigation(presentation)
  const queries = useMailQueries({ ...presentation, ...navigation })
  const realtime = useMailRealtime({
    ...presentation,
    ...navigation,
    ...queries,
  })
  const mutations = useMailMutations({
    ...presentation,
    ...navigation,
    ...queries,
    ...realtime,
  })
  const dataActions = useMailDataActions({
    ...presentation,
    ...navigation,
    ...queries,
    ...realtime,
    ...mutations,
  })
  const basicActions = useMailBasicActions({
    ...presentation,
    ...navigation,
    ...queries,
    ...realtime,
    ...mutations,
    ...dataActions,
  })
  const messageActions = useMailMessageActions({
    ...presentation,
    ...navigation,
    ...queries,
    ...realtime,
    ...mutations,
    ...dataActions,
    ...basicActions,
  })
  const uiActions = useMailUiActions({
    ...presentation,
    ...navigation,
    ...queries,
    ...realtime,
    ...mutations,
    ...dataActions,
    ...basicActions,
    ...messageActions,
  })
  const effects = useMailEffects({
    ...presentation,
    ...navigation,
    ...queries,
    ...realtime,
    ...mutations,
    ...dataActions,
    ...basicActions,
    ...messageActions,
    ...uiActions,
  })

  return {
    ...presentation,
    ...navigation,
    ...queries,
    ...realtime,
    ...mutations,
    ...dataActions,
    ...basicActions,
    ...messageActions,
    ...uiActions,
    ...effects,
  }
}

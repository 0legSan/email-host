import { mailText } from "@workspace/mail-design/locale"
import { useMemo } from "react"
import { getFunctionName } from "convex/server"
import type {
  useMutation as RealUseMutation,
  useQuery as RealUseQuery,
  useQueries as RealUseQueries,
} from "convex/react"
import { updateMessageFlagsBatch } from "./store"

export const useQuery: typeof RealUseQuery = (_reference, ...args) => {
  if (args[0] === "skip") return undefined
  throw new Error(
    mailText(
      "Демо не поддерживает Convex query. Отключи realtime через realtimeEnabled={false}.",
      "The demo does not support Convex queries. Disable realtime with realtimeEnabled={false}."
    )
  )
}
export const useQueries: typeof RealUseQueries = (queries) => {
  if (Object.keys(queries).length === 0) return {}
  throw new Error(
    mailText(
      "Демо не поддерживает Convex queries. Отключи realtime через realtimeEnabled={false}.",
      "The demo does not support Convex queries. Disable realtime with realtimeEnabled={false}."
    )
  )
}
export const useMutation: typeof RealUseMutation = (reference) => {
  const name = getFunctionName(reference)
  return useMemo(() => {
    const mutation = async (args: unknown) => {
      if (name !== "mail:updateMessageFlagsBatch")
        throw new Error(
          mailText(
            `Mutation ${name} недоступна в локальном демо`,
            `Mutation ${name} is unavailable in the local demo`
          )
        )
      if (
        !args ||
        typeof args !== "object" ||
        !("updates" in args) ||
        !Array.isArray(args.updates)
      )
        throw new Error(
          mailText(
            "Некорректный пакет флагов демо",
            "Invalid demo flag update batch"
          )
        )
      const updates = args.updates.map((value: unknown) => {
        if (
          !value ||
          typeof value !== "object" ||
          !("messagePublicId" in value) ||
          typeof value.messagePublicId !== "string"
        )
          throw new Error(
            mailText("Некорректный идентификатор письма", "Invalid message ID")
          )
        return {
          messagePublicId: value.messagePublicId,
          ...("seen" in value && typeof value.seen === "boolean"
            ? { seen: value.seen }
            : {}),
          ...("flagged" in value && typeof value.flagged === "boolean"
            ? { flagged: value.flagged }
            : {}),
        }
      })
      return updateMessageFlagsBatch(updates)
    }
    const wrapper = Object.assign(mutation, {
      withOptimisticUpdate: () => wrapper,
    })
    // Only the known mutation is executed; the public generic signature comes from Convex.
    return wrapper as ReturnType<typeof RealUseMutation>
  }, [name])
}

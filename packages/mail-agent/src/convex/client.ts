import { ConvexClient, ConvexHttpClient } from "convex/browser"
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server"

export class MailAgentConvexClient {
  private readonly client: ConvexHttpClient
  private readonly subscriptionClient: ConvexClient

  constructor(url: string, adminKey: string) {
    this.client = new ConvexHttpClient(url, {
      skipConvexDeploymentUrlCheck: true,
    })
    this.subscriptionClient = new ConvexClient(url, {
      skipConvexDeploymentUrlCheck: true,
    })
    ;(
      this.client as ConvexHttpClient & {
        setAdminAuth(token: string): void
      }
    ).setAdminAuth(adminKey)
    ;(
      this.subscriptionClient as ConvexClient & {
        setAdminAuth(token: string): void
      }
    ).setAdminAuth(adminKey)
  }

  query<Query extends FunctionReference<"query", "public" | "internal">>(
    query: Query,
    args: FunctionArgs<Query>
  ): Promise<FunctionReturnType<Query>> {
    return this.client.query(
      query as FunctionReference<"query">,
      args as FunctionArgs<FunctionReference<"query">>
    ) as Promise<FunctionReturnType<Query>>
  }

  mutation<
    Mutation extends FunctionReference<"mutation", "public" | "internal">,
  >(
    mutation: Mutation,
    args: FunctionArgs<Mutation>
  ): Promise<FunctionReturnType<Mutation>> {
    return this.client.mutation(
      mutation as FunctionReference<"mutation">,
      args as FunctionArgs<FunctionReference<"mutation">>
    ) as Promise<FunctionReturnType<Mutation>>
  }

  subscribe<Query extends FunctionReference<"query", "public" | "internal">>(
    query: Query,
    args: FunctionArgs<Query>,
    onUpdate: (result: FunctionReturnType<Query>) => void,
    onError: (error: Error) => void
  ) {
    return this.subscriptionClient.onUpdate(
      query as FunctionReference<"query">,
      args as FunctionArgs<FunctionReference<"query">>,
      onUpdate as (result: unknown) => void,
      onError
    )
  }

  close() {
    return this.subscriptionClient.close()
  }
}

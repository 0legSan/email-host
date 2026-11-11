import { randomUUID } from "node:crypto"

import type { Id } from "../../../../convex/_generated/dataModel"
import { internal } from "../../../../convex/_generated/api"
import type {
  CreateMailAccountProfileRequest,
  MailAccountProfileDto,
  UpdateMailAccountProfileRequest,
} from "../contracts"
import type { MailAgentConvexClient } from "../convex/client"

export class InvalidProfileAccountsError extends Error {
  constructor() {
    super("Invalid profile accounts")
  }
}

export class AccountProfileService {
  private readonly convex: MailAgentConvexClient

  constructor(convex: MailAgentConvexClient) {
    this.convex = convex
  }

  async listProfiles(
    userId: Id<"users">
  ): Promise<MailAccountProfileDto[]> {
    const profiles = await this.convex.query(
      internal.profilesInternal.list,
      {
        userId,
      }
    )
    return profiles.sort((first, second) =>
      first.name.localeCompare(second.name)
    )
  }

  async createProfile(
    userId: Id<"users">,
    request: CreateMailAccountProfileRequest
  ): Promise<MailAccountProfileDto> {
    const result = await this.convex.mutation(
      internal.profilesInternal.create,
      {
        userId,
        publicId: randomUUID(),
        name: request.name,
        accountPublicIds: request.accountIds,
      }
    )

    if (!result.ok || !result.profile) {
      throw new InvalidProfileAccountsError()
    }
    return result.profile
  }

  async updateProfile(
    userId: Id<"users">,
    profilePublicId: string,
    request: UpdateMailAccountProfileRequest
  ): Promise<MailAccountProfileDto | null> {
    const result = await this.convex.mutation(
      internal.profilesInternal.update,
      {
        userId,
        publicId: profilePublicId,
        name: request.name,
        accountPublicIds: request.accountIds,
      }
    )

    if (!result.ok && result.code === "invalid_accounts") {
      throw new InvalidProfileAccountsError()
    }
    return result.ok ? result.profile : null
  }

  async deleteProfile(
    userId: Id<"users">,
    profilePublicId: string
  ): Promise<boolean> {
    return await this.convex.mutation(internal.profilesInternal.remove, {
      userId,
      publicId: profilePublicId,
    })
  }
}

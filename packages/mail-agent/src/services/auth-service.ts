import { randomUUID } from "node:crypto"

import type { Id } from "../../../../convex/_generated/dataModel"
import { internal } from "../../../../convex/_generated/api"
import type {
  CreatePasswordResetLinkRequest,
  CreateRegistrationInviteRequest,
  ManagedUserDto,
  PasswordResetLinkCreatedDto,
  PasswordResetLinkPublicDto,
  RegisterWithInviteRequest,
  RegistrationInviteCreatedDto,
  RegistrationInvitePublicDto,
  ResetPasswordRequest,
  UserDto,
  UserRole,
} from "../contracts"
import { hashPassword, verifyPassword } from "../auth/password"
import {
  createSessionExpiry,
  createSessionToken,
  hashSessionToken,
} from "../auth/session"
import type { MailAgentConvexClient } from "../convex/client"

const dayMs = 24 * 60 * 60 * 1000

export type AuthSession = {
  token: string
  expiresAt: Date
  user: UserDto
}

export type UserRow = {
  id: Id<"users">
  publicId: string
  email: string
  passwordHash: string
  role: UserRole
  displayName: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export type AuthSessionRecord = {
  expiresAt: Date
  user: UserRow
}

export class AuthService {
  private readonly convex: MailAgentConvexClient
  private readonly sessionSecret: string

  constructor(convex: MailAgentConvexClient, sessionSecret: string) {
    this.convex = convex
    this.sessionSecret = sessionSecret
  }

  async seedOwner(email: string, password: string) {
    const normalizedEmail = email.toLowerCase()
    await this.convex.mutation(internal.authInternal.seedOwner, {
      publicId: randomUUID(),
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
      displayName: "Owner",
    })
  }

  async login(email: string, password: string): Promise<AuthSession | null> {
    const user = await this.convex.query(
      internal.authInternal.findUserByEmail,
      {
        email: email.toLowerCase(),
      }
    )

    if (
      !user ||
      user.deletedAt !== undefined ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      return null
    }

    const token = createSessionToken()
    const expiresAt = createSessionExpiry()
    await this.convex.mutation(internal.authInternal.createSession, {
      publicId: randomUUID(),
      userId: user._id,
      tokenHash: hashSessionToken(token, this.sessionSecret),
      expiresAt: expiresAt.getTime(),
    })

    return {
      token,
      expiresAt,
      user: toUserDto(toUserRow(user)),
    }
  }

  async createRegistrationInvite(
    createdByUserId: Id<"users">,
    request: CreateRegistrationInviteRequest
  ): Promise<RegistrationInviteCreatedDto> {
    const token = createSessionToken()
    const expiresAt = new Date(Date.now() + request.expiresInDays * dayMs)
    await this.convex.mutation(
      internal.authInternal.createRegistrationInvite,
      {
        publicId: randomUUID(),
        tokenHash: this.hashRegistrationInviteToken(token),
        createdByUserId,
        expiresAt: expiresAt.getTime(),
      }
    )

    return {
      token,
      expiresAt: expiresAt.toISOString(),
    }
  }

  async getRegistrationInvite(
    token: string
  ): Promise<RegistrationInvitePublicDto | null> {
    const invite = await this.convex.query(
      internal.authInternal.getRegistrationInvite,
      {
        tokenHash: this.hashRegistrationInviteToken(token),
        now: Date.now(),
      }
    )

    return invite
      ? {
          expiresAt: new Date(invite.expiresAt).toISOString(),
        }
      : null
  }

  async listManagedUsers(): Promise<ManagedUserDto[]> {
    const users = await this.convex.query(internal.authInternal.listUsers, {})

    return users
      .map((user) => toManagedUserDto(toUserRow(user)))
      .sort(
        (first, second) =>
          first.role.localeCompare(second.role) ||
          first.email.localeCompare(second.email)
      )
  }

  async deactivateManagedUser(
    requestedByUserId: Id<"users">,
    targetUserPublicId: string
  ): Promise<ManagedUserDto> {
    const result = await this.convex.mutation(
      internal.authInternal.deactivateUser,
      {
        requestedByUserId,
        targetPublicId: targetUserPublicId,
        now: Date.now(),
      }
    )

    if (!result.ok) {
      if (result.code === "user_not_found") {
        throw new UserNotFoundError()
      }
      throw new OwnerUserMutationForbiddenError()
    }

    if (!result.user) {
      throw new UserNotFoundError()
    }

    return toManagedUserDto(toUserRow(result.user))
  }

  async createPasswordResetLink(
    createdByUserId: Id<"users">,
    targetUserPublicId: string,
    request: CreatePasswordResetLinkRequest
  ): Promise<{ link: PasswordResetLinkCreatedDto; user: ManagedUserDto }> {
    const token = createSessionToken()
    const expiresAt = new Date(Date.now() + request.expiresInDays * dayMs)
    const result = await this.convex.mutation(
      internal.authInternal.createPasswordResetLink,
      {
        publicId: randomUUID(),
        tokenHash: this.hashPasswordResetToken(token),
        targetPublicId: targetUserPublicId,
        createdByUserId,
        expiresAt: expiresAt.getTime(),
      }
    )

    if (!result.ok) {
      if (result.code === "user_deactivated") {
        throw new UserDeactivatedError()
      }
      throw new UserNotFoundError()
    }

    return {
      link: {
        token,
        expiresAt: new Date(result.link?.expiresAt ?? expiresAt).toISOString(),
      },
      user: toManagedUserDto(toUserRow(result.user)),
    }
  }

  async getPasswordResetLink(
    token: string
  ): Promise<PasswordResetLinkPublicDto | null> {
    const link = await this.convex.query(
      internal.authInternal.getPasswordResetLink,
      {
        tokenHash: this.hashPasswordResetToken(token),
        now: Date.now(),
      }
    )

    return link
      ? {
          expiresAt: new Date(link.expiresAt).toISOString(),
        }
      : null
  }

  async resetPassword(request: ResetPasswordRequest): Promise<AuthSession> {
    const now = new Date()
    const sessionToken = createSessionToken()
    const sessionExpiresAt = createSessionExpiry(now)
    const result = await this.convex.mutation(
      internal.authInternal.resetPassword,
      {
        tokenHash: this.hashPasswordResetToken(request.token),
        passwordHash: await hashPassword(request.password),
        sessionPublicId: randomUUID(),
        sessionTokenHash: hashSessionToken(sessionToken, this.sessionSecret),
        sessionExpiresAt: sessionExpiresAt.getTime(),
        now: now.getTime(),
      }
    )

    if (!result.ok || !result.user) {
      throw new PasswordResetLinkInvalidError()
    }

    return {
      token: sessionToken,
      expiresAt: sessionExpiresAt,
      user: toUserDto(toUserRow(result.user)),
    }
  }

  async registerWithInvite(
    request: RegisterWithInviteRequest
  ): Promise<AuthSession> {
    const now = new Date()
    const sessionToken = createSessionToken()
    const sessionExpiresAt = createSessionExpiry(now)
    const result = await this.convex.mutation(
      internal.authInternal.registerWithInvite,
      {
        inviteTokenHash: this.hashRegistrationInviteToken(request.token),
        publicId: randomUUID(),
        email: request.email.toLowerCase(),
        passwordHash: await hashPassword(request.password),
        displayName: normalizeDisplayName(request.displayName) ?? undefined,
        sessionPublicId: randomUUID(),
        sessionTokenHash: hashSessionToken(sessionToken, this.sessionSecret),
        sessionExpiresAt: sessionExpiresAt.getTime(),
        now: now.getTime(),
      }
    )

    if (!result.ok) {
      if (result.code === "email_already_registered") {
        throw new UserEmailAlreadyRegisteredError()
      }
      throw new RegistrationInviteInvalidError()
    }

    if (!result.user) {
      throw new RegistrationInviteInvalidError()
    }

    return {
      token: sessionToken,
      expiresAt: sessionExpiresAt,
      user: toUserDto(toUserRow(result.user)),
    }
  }

  async getUserBySessionToken(token: string): Promise<UserDto | null> {
    const user = await this.getUserRecordBySessionToken(token)
    return user ? toUserDto(user) : null
  }

  async getUserRecordBySessionToken(token: string): Promise<UserRow | null> {
    const session = await this.getSessionByToken(token)
    return session?.user ?? null
  }

  async getSessionByToken(token: string): Promise<AuthSessionRecord | null> {
    const result = await this.convex.query(internal.authInternal.getSession, {
      tokenHash: hashSessionToken(token, this.sessionSecret),
      now: Date.now(),
    })

    if (!result) {
      return null
    }

    return {
      expiresAt: new Date(result.session.expiresAt),
      user: toUserRow(result.user),
    }
  }

  async refreshSession(token: string): Promise<Date> {
    const now = new Date()
    const expiresAt = createSessionExpiry(now)
    await this.convex.mutation(internal.authInternal.refreshSession, {
      tokenHash: hashSessionToken(token, this.sessionSecret),
      now: now.getTime(),
      expiresAt: expiresAt.getTime(),
    })
    return expiresAt
  }

  async logout(token: string): Promise<void> {
    await this.convex.mutation(internal.authInternal.revokeSession, {
      tokenHash: hashSessionToken(token, this.sessionSecret),
      now: Date.now(),
    })
  }

  private hashRegistrationInviteToken(token: string) {
    return hashSessionToken(token, this.sessionSecret)
  }

  private hashPasswordResetToken(token: string) {
    return hashSessionToken(token, this.sessionSecret)
  }
}

export function toUserDto(user: UserRow): UserDto {
  return {
    id: user.publicId,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
  }
}

export function toManagedUserDto(user: UserRow): ManagedUserDto {
  return {
    ...toUserDto(user),
    createdAt: user.createdAt.toISOString(),
    deactivatedAt: user.deletedAt?.toISOString() ?? null,
  }
}

function toUserRow(user: {
  _id: Id<"users">
  publicId: string
  email: string
  passwordHash: string
  role: UserRole
  displayName?: string
  createdAt: number
  updatedAt: number
  deletedAt?: number
}): UserRow {
  return {
    id: user._id,
    publicId: user.publicId,
    email: user.email,
    passwordHash: user.passwordHash,
    role: user.role,
    displayName: user.displayName ?? null,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
    deletedAt:
      user.deletedAt === undefined ? null : new Date(user.deletedAt),
  }
}

export class RegistrationInviteInvalidError extends Error {
  constructor() {
    super("Registration invite is invalid")
    this.name = "RegistrationInviteInvalidError"
  }
}

export class PasswordResetLinkInvalidError extends Error {
  constructor() {
    super("Password reset link is invalid")
    this.name = "PasswordResetLinkInvalidError"
  }
}

export class UserEmailAlreadyRegisteredError extends Error {
  constructor() {
    super("Email is already registered")
    this.name = "UserEmailAlreadyRegisteredError"
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super("User not found")
    this.name = "UserNotFoundError"
  }
}

export class UserDeactivatedError extends Error {
  constructor() {
    super("User is deactivated")
    this.name = "UserDeactivatedError"
  }
}

export class OwnerUserMutationForbiddenError extends Error {
  constructor() {
    super("Owner user cannot be changed by this action")
    this.name = "OwnerUserMutationForbiddenError"
  }
}

function normalizeDisplayName(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

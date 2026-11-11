import { importPKCS8, SignJWT, type JWK } from "jose"

import type { UserRow } from "../services/auth-service"

const tokenTtlSeconds = 5 * 60

export class ConvexJwtService {
  private readonly issuer: string
  private readonly keyId: string
  private readonly privateKey: ReturnType<typeof importPKCS8>
  private readonly publicJwk: JWK

  constructor(options: {
    issuer: string
    keyId: string
    privateKey: string
    publicJwk: JWK
  }) {
    this.issuer = options.issuer
    this.keyId = options.keyId
    this.privateKey = importPKCS8(options.privateKey, "RS256")
    this.publicJwk = {
      ...options.publicJwk,
      alg: "RS256",
      kid: options.keyId,
      use: "sig",
    }
  }

  getJwks() {
    return {
      keys: [this.publicJwk],
    }
  }

  async createToken(user: UserRow) {
    return await new SignJWT({
      email: user.email,
      role: user.role,
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: this.keyId,
        typ: "JWT",
      })
      .setAudience("email-host-convex")
      .setIssuer(this.issuer)
      .setSubject(user.publicId)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + tokenTtlSeconds)
      .sign(await this.privateKey)
  }
}

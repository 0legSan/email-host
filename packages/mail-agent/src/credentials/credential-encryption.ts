import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const algorithm = "aes-256-gcm"
const ivLength = 12
const keyLength = 32

export type EncryptedCredential = {
  ciphertext: string
  iv: string
  tag: string
}

export function isValidMailCredentialSecret(secret: string) {
  try {
    decodeMailCredentialSecret(secret)
    return true
  } catch {
    return false
  }
}

export function encryptCredential(
  plaintext: string,
  secret: string
): EncryptedCredential {
  const key = decodeMailCredentialSecret(secret)
  const iv = randomBytes(ivLength)
  const cipher = createCipheriv(algorithm, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  }
}

export function decryptCredential(
  encrypted: EncryptedCredential,
  secret: string
) {
  const key = decodeMailCredentialSecret(secret)
  const decipher = createDecipheriv(
    algorithm,
    key,
    Buffer.from(encrypted.iv, "base64")
  )

  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"))

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8")
}

export function decodeMailCredentialSecret(secret: string) {
  const trimmed = secret.trim()

  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, "hex")
  }

  if (isBase64(trimmed)) {
    const base64Key = Buffer.from(trimmed, "base64")

    if (base64Key.length === keyLength) {
      return base64Key
    }
  }

  const utf8Key = Buffer.from(trimmed, "utf8")

  if (utf8Key.length === keyLength) {
    return utf8Key
  }

  throw new Error("MAIL_CREDENTIAL_SECRET must decode to 32 bytes")
}

function isBase64(value: string) {
  if (value.length === 0 || value.length % 4 === 1) {
    return false
  }

  return /^[A-Za-z0-9+/]+={0,2}$/.test(value)
}

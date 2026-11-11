import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto"
import { promisify } from "util"

const scrypt = promisify(scryptCallback)
const keyLength = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url")
  const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer

  return `scrypt$${salt}$${derivedKey.toString("base64url")}`
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  const [algorithm, salt, storedKey] = passwordHash.split("$")

  if (algorithm !== "scrypt" || !salt || !storedKey) {
    return false
  }

  const storedBuffer = Buffer.from(storedKey, "base64url")
  const derivedBuffer = (await scrypt(password, salt, storedBuffer.length)) as Buffer

  return (
    storedBuffer.length === derivedBuffer.length &&
    timingSafeEqual(storedBuffer, derivedBuffer)
  )
}

import { randomBytes, randomUUID, generateKeyPairSync } from "node:crypto"
import { mkdir, lstat, readFile, rename, writeFile, link, unlink } from "node:fs/promises"
import path from "node:path"

const flags = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const flag = process.argv[index]
  if (["--set-admin-key", "--recover-credentials"].includes(flag) && !flags.has(flag)) {
    flags.set(flag, true)
  } else if (
    ["--output", "--app-domain", "--convex-domain", "--convex-site-domain", "--version"].includes(flag) &&
    process.argv[index + 1] &&
    !flags.has(flag)
  ) {
    flags.set(flag, process.argv[++index])
  } else {
    throw new Error(`Unknown, duplicate or incomplete option: ${flag}`)
  }
}

function required(name) {
  const value = flags.get(name)
  if (typeof value !== "string" || !value) throw new Error(`Required option: ${name}`)
  return value
}

function domain(name) {
  const value = required(name).toLowerCase()
  if (
    value.length > 253 ||
    !value.includes(".") ||
    !value.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
    !/\.[a-z][a-z0-9-]*$/.test(value)
  ) throw new Error(`Expected a DNS name for ${name}`)
  return value
}

async function exists(file) {
  try {
    await lstat(file)
    return true
  } catch (error) {
    if (error.code === "ENOENT") return false
    throw error
  }
}

function envValue(value) {
  if (/[\r\n']/.test(value)) throw new Error("Unsupported dotenv value")
  return `'${value}'`
}

async function writeNewFile(file, contents) {
  const temporary = `${file}.${randomUUID()}.tmp`
  await writeFile(temporary, contents, { mode: 0o600, flag: "wx" })
  try {
    // link publishes a complete file atomically and refuses an existing target.
    await link(temporary, file)
  } finally {
    await unlink(temporary)
  }
}

async function readEnvironment(directory) {
  const file = path.join(directory, ".env")
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) {
    throw new Error("Expected a private regular .env file")
  }
  const contents = await readFile(file, "utf8")
  const values = new Map()
  for (const line of contents.split("\n")) {
    if (!line || line.startsWith("#")) continue
    const match = /^([A-Z][A-Z0-9_]*)='([^'\r\n]*)'$/.exec(line)
    if (!match || values.has(match[1])) throw new Error("Unrecognized or duplicate dotenv field")
    values.set(match[1], match[2])
  }
  return { values, contents }
}

function credentialText(url, email, password) {
  return `URL: ${url}\nLogin: ${email}\nPassword: ${password}\n\nThe login is an application identifier. No mailbox or email verification is required.\n`
}

async function recoverCredentials(directory) {
  const target = path.join(directory, "credentials.txt")
  if (await exists(target)) throw new Error("Credentials file already exists; refusing to replace it")
  const { values } = await readEnvironment(directory)
  const url = values.get("APP_BASE_URL")
  const email = values.get("OWNER_EMAIL")
  const password = values.get("OWNER_PASSWORD")
  if (!/^https:\/\/[a-z0-9.-]+$/.test(url ?? "") ||
      !/^owner@[a-z0-9.-]+$/.test(email ?? "") ||
      !/^[A-Za-z0-9_-]{24,}$/.test(password ?? "")) {
    throw new Error("Cannot recover credentials from unrecognized configuration")
  }
  await writeNewFile(target, credentialText(url, email, password))
  console.log("Owner credentials recovered; encryption keys were preserved")
}

async function setAdminKey(directory) {
  const envPath = path.join(directory, ".env")
  const stat = await lstat(envPath)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Expected a regular .env file")
  const chunks = []
  let length = 0
  for await (const chunk of process.stdin) {
    length += chunk.length
    if (length > 8192) throw new Error("Admin key input is too long")
    chunks.push(chunk)
  }
  const key = Buffer.concat(chunks).toString("utf8").trim()
  if (!/^[A-Za-z0-9_|:=+/.~-]{8,4096}$/.test(key)) throw new Error("Invalid admin key input")
  const { values, contents } = await readEnvironment(directory)
  if ((contents.match(/^CONVEX_SELF_HOSTED_ADMIN_KEY=/gm) ?? []).length !== 1) {
    throw new Error("Expected exactly one admin key field in .env")
  }
  const current = values.get("CONVEX_SELF_HOSTED_ADMIN_KEY")
  if (current) {
    if (current !== key) throw new Error("Refusing to replace an existing administrative key")
    console.log("Administrative key already saved")
    return
  }
  const next = contents.replace(/^CONVEX_SELF_HOSTED_ADMIN_KEY=.*$/m, `CONVEX_SELF_HOSTED_ADMIN_KEY=${envValue(key)}`)
  const temporary = path.join(directory, `.env.admin-${randomUUID()}`)
  await writeFile(temporary, next, { mode: 0o600, flag: "wx" })
  await rename(temporary, envPath)
  console.log("Administrative key saved in .env")
}

const output = path.resolve(required("--output"))
await mkdir(output, { recursive: true, mode: 0o700 })
const outputStat = await lstat(output)
if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) throw new Error("Expected a regular output directory")

if (flags.has("--recover-credentials")) {
  if (flags.size !== 2) throw new Error("Credential recovery accepts only --output")
  await recoverCredentials(output)
} else if (flags.has("--set-admin-key")) {
  if (flags.size !== 2) throw new Error("Admin key update accepts only --output")
  await setAdminKey(output)
} else {
  const appDomain = domain("--app-domain")
  const convexDomain = domain("--convex-domain")
  const convexSiteDomain = domain("--convex-site-domain")
  if (new Set([appDomain, convexDomain, convexSiteDomain]).size !== 3) throw new Error("Domains must differ")
  const version = required("--version")
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(version) || version === "latest") {
    throw new Error("Expected a fixed release version")
  }

  const envPath = path.join(output, ".env")
  const credentialsPath = path.join(output, "credentials.txt")
  if (await exists(envPath) || await exists(credentialsPath)) throw new Error("Configuration already exists; refusing to replace keys")

  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const password = randomBytes(24).toString("base64url")
  const environment = {
    EMAIL_HOST_VERSION: version,
    APP_DOMAIN: appDomain,
    CONVEX_DOMAIN: convexDomain,
    CONVEX_SITE_DOMAIN: convexSiteDomain,
    CONVEX_PUBLIC_URL: `https://${convexDomain}`,
    CONVEX_SITE_URL: `https://${convexSiteDomain}`,
    APP_BASE_URL: `https://${appDomain}`,
    WEB_ORIGIN: `https://${appDomain}`,
    CONVEX_AUTH_ISSUER: `https://${appDomain}`,
    CONVEX_AUTH_JWKS: "http://api:3001/api/auth/jwks",
    CONVEX_SELF_HOSTED_URL: "http://convex-backend:3210",
    CONVEX_SELF_HOSTED_ADMIN_KEY: "",
    OWNER_EMAIL: `owner@${appDomain}`,
    OWNER_PASSWORD: password,
    SESSION_SECRET: randomBytes(32).toString("hex"),
    MAIL_CREDENTIAL_SECRET: randomBytes(32).toString("hex"),
    CONVEX_POSTGRES_PASSWORD: randomBytes(32).toString("hex"),
    CONVEX_INSTANCE_NAME: "email-host-convex",
    CONVEX_INSTANCE_SECRET: randomBytes(32).toString("hex"),
    CONVEX_JWT_KEY_ID: randomUUID(),
    CONVEX_JWT_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString().replaceAll("\n", "\\n"),
    CONVEX_JWT_PUBLIC_JWK: JSON.stringify(publicKey.export({ format: "jwk" })),
  }
  const contents = Object.entries(environment).map(([name, value]) => `${name}=${envValue(value)}`).join("\n") + "\n"
  const credentials = credentialText(`https://${appDomain}`, `owner@${appDomain}`, password)
  await writeNewFile(envPath, contents)
  await writeNewFile(credentialsPath, credentials)
  console.log("Configuration and owner credentials created. Existing installations were not modified.")
}

import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { lstatSync, writeFileSync } from "node:fs"
import path from "node:path"

const allowed = ["--version", "--platform", "--archive", "--ids", "--provenance", "--caddy-source", "--source-commit", "--source-dirty"]
const options = new Map()
const arguments_ = process.argv.slice(2)
for (let index = 0; index < arguments_.length; index += 2) {
  const key = arguments_[index]
  if (!allowed.includes(key) || !arguments_[index + 1] || options.has(key)) throw new Error("Unknown, duplicate or incomplete image packaging option")
  options.set(key, arguments_[index + 1])
}
if (allowed.some((key) => !options.has(key))) throw new Error("All image packaging options are required")

const version = options.get("--version")
const platform = options.get("--platform")
if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9][A-Za-z0-9.-]*)?$/.test(version)) throw new Error("Invalid release version")
if (!["linux/amd64", "linux/arm64"].includes(platform)) throw new Error("Unsupported platform")
const commit = options.get("--source-commit")
if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error("Invalid source commit")
const dirty = options.get("--source-dirty")
if (!["true", "false"].includes(dirty)) throw new Error("Invalid source status")
const caddySource = options.get("--caddy-source")
if (!/^caddy:2\.10\.2-alpine@sha256:[a-f0-9]{64}$/.test(caddySource)) throw new Error("Expected the resolved Caddy source digest")

const archive = path.resolve(options.get("--archive"))
const information = lstatSync(archive)
if (!information.isFile() || information.isSymbolicLink()) throw new Error("Expected a regular Docker-save archive")
const expected = new Map([
  [`ghcr.io/0legsan/email-host-api:${version}`, { source: "Email Host API", dockerfile: "deploy/public/Dockerfile.api" }],
  [`ghcr.io/0legsan/email-host-web:${version}`, { source: "Email Host web", dockerfile: "deploy/public/Dockerfile.web" }],
  [`email-host/postgres:${version}`, { source: "postgres:17-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193" }],
  [`email-host/convex-backend:${version}`, { source: "ghcr.io/convex/convex-backend@sha256:467964cc6af57ba3e757e3e6cb1fa09a1c577803a19f03f0f42c9c4b134b070c" }],
  [`email-host/caddy:${version}`, { source: caddySource }],
])

const metadataCache = new Map()
function archiveFile(name) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(name) || name.split("/").includes("..")) throw new Error("Unsafe Docker-save metadata path")
  if (!metadataCache.has(name)) metadataCache.set(name, execFileSync("tar", ["-xOf", archive, name], { maxBuffer: 2 * 1024 * 1024, env: { ...process.env, LC_ALL: "C" } }))
  return metadataCache.get(name)
}

const manifest = JSON.parse(archiveFile("manifest.json").toString("utf8"))
if (!Array.isArray(manifest) || manifest.length !== 5) throw new Error("Expected exactly five runtime images")
let index
try {
  index = JSON.parse(archiveFile("index.json").toString("utf8"))
} catch {
  throw new Error("A valid OCI index.json is required; use a Docker-save export that preserves tagged OCI descriptors")
}
if (index?.schemaVersion !== 2 || !Array.isArray(index.manifests) || index.manifests.length !== 5) throw new Error("Expected five tagged descriptors in OCI index.json")
const indexTypes = new Set(["application/vnd.oci.image.index.v1+json", "application/vnd.docker.distribution.manifest.list.v2+json"])
const manifestTypes = new Set(["application/vnd.oci.image.manifest.v1+json", "application/vnd.docker.distribution.manifest.v2+json"])
const configTypes = new Set(["application/vnd.oci.image.config.v1+json", "application/vnd.docker.container.image.v1+json"])
const tagged = new Map()
for (const descriptor of index.manifests) {
  const annotated = descriptor?.annotations?.["io.containerd.image.name"]
  if (typeof annotated !== "string") throw new Error("OCI descriptor has no full image-name annotation")
  const reference = annotated.startsWith("docker.io/") ? annotated.slice("docker.io/".length) : annotated
  if (!expected.has(reference) || tagged.has(reference)) throw new Error("Unexpected or duplicate tagged OCI descriptor")
  tagged.set(reference, descriptor)
}

function descriptorBlob(descriptor) {
  if (!descriptor || !/^sha256:[a-f0-9]{64}$/.test(descriptor.digest) || !Number.isSafeInteger(descriptor.size) || descriptor.size <= 0 || descriptor.size > 2 * 1024 * 1024) throw new Error("Invalid OCI metadata descriptor")
  const bytes = archiveFile(`blobs/sha256/${descriptor.digest.slice(7)}`)
  if (bytes.length !== descriptor.size || `sha256:${createHash("sha256").update(bytes).digest("hex")}` !== descriptor.digest) throw new Error("OCI metadata blob digest or size does not match its descriptor")
  return JSON.parse(bytes.toString("utf8"))
}

function selectedManifests(descriptor, ancestry = new Set(), depth = 0) {
  if (depth > 8 || ancestry.has(descriptor?.digest)) throw new Error("Cyclic or excessively deep OCI graph")
  if (descriptor?.platform && `${descriptor.platform.os}/${descriptor.platform.architecture}` !== platform) return []
  const data = descriptorBlob(descriptor)
  if (data.schemaVersion !== 2 || (data.mediaType && data.mediaType !== descriptor.mediaType)) throw new Error("OCI manifest media type or schema mismatch")
  if (indexTypes.has(descriptor.mediaType)) {
    if (!Array.isArray(data.manifests) || data.manifests.length < 1 || data.manifests.length > 64) throw new Error("Invalid OCI image index graph")
    const next = new Set(ancestry).add(descriptor.digest)
    return data.manifests.flatMap((child) => selectedManifests(child, next, depth + 1))
  }
  if (!manifestTypes.has(descriptor.mediaType) || !configTypes.has(data.config?.mediaType) || !Array.isArray(data.layers)) throw new Error("Invalid OCI image manifest")
  const config = descriptorBlob(data.config)
  if (`${config.os}/${config.architecture}` !== platform) {
    if (descriptor.platform) throw new Error("OCI platform annotation does not match image config")
    return []
  }
  return [data]
}

const images = new Map()
for (const entry of manifest) {
  if (typeof entry.Config !== "string" || !Array.isArray(entry.RepoTags) || entry.RepoTags.length !== 1) throw new Error("Unexpected Docker-save manifest entry")
  const reference = entry.RepoTags[0]
  if (!expected.has(reference) || images.has(reference)) throw new Error("Unexpected or duplicate runtime image reference")
  const bytes = archiveFile(entry.Config)
  const config = JSON.parse(bytes.toString("utf8"))
  if (`${config.os}/${config.architecture}` !== platform) throw new Error(`Wrong platform for ${reference}`)
  const configId = `sha256:${createHash("sha256").update(bytes).digest("hex")}`
  const descriptor = tagged.get(reference)
  const selected = selectedManifests(descriptor)
  if (selected.length !== 1 || selected[0].config.digest !== configId) throw new Error(`Tagged OCI graph does not select the Docker-save config for ${reference}`)
  if (!Array.isArray(entry.Layers) || JSON.stringify(selected[0].layers.map((layer) => `blobs/sha256/${layer.digest?.slice(7)}`)) !== JSON.stringify(entry.Layers)) throw new Error(`OCI layers do not match the Docker-save image for ${reference}`)
  images.set(reference, { reference, configId, descriptorId: descriptor.digest, ...expected.get(reference) })
}
if (images.size !== expected.size) throw new Error("Incomplete runtime image bundle")

// Classic stores expose the config ID, while containerd stores can expose the
// tagged manifest/index ID. Both must be authenticated and tied to this image.
const ordered = [...expected.keys()].map((reference) => images.get(reference))
const ids = ordered.map((image) => `${image.configId},${image.descriptorId}  ${image.reference}\n`).join("")
const provenance = {
  version,
  platform,
  source: { repository: "https://github.com/0legSan/email-host", commit, workingTreeDirty: dirty === "true" },
  format: "Docker image save",
  images: ordered,
}
writeFileSync(options.get("--ids"), ids, { flag: "wx" })
writeFileSync(options.get("--provenance"), `${JSON.stringify(provenance, null, 2)}\n`, { flag: "wx" })
console.log(`Verified five ${platform} image graphs and wrote config/descriptor ID pairs`)

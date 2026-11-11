import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const script = fileURLToPath(new URL("./package-public-images.mjs", import.meta.url))
const version = "0.1.0-fixture"
const refs = ["ghcr.io/0legsan/email-host-api", "ghcr.io/0legsan/email-host-web", "email-host/postgres", "email-host/convex-backend", "email-host/caddy"].map((reference) => `${reference}:${version}`)
const manifestType = "application/vnd.oci.image.manifest.v1+json"
const indexType = "application/vnd.oci.image.index.v1+json"
const configType = "application/vnd.oci.image.config.v1+json"
const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`

function fixture(t, transform = (manifest) => manifest, architecture = "arm64", changeGraph = () => {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "email-host-image-metadata-test-"))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const blobs = new Map()
  const put = (data, mediaType) => {
    const bytes = Buffer.from(JSON.stringify(data))
    const digest = hash(bytes)
    blobs.set(`blobs/sha256/${digest.slice(7)}`, bytes)
    return { mediaType, digest, size: bytes.length }
  }
  const configs = refs.map((reference) => ({ architecture, os: "linux", config: { Labels: { fixture: reference } } }))
  const configDescriptors = configs.map((config) => put(config, configType))
  const roots = configDescriptors.map((config, index) => {
    const selected = put({ schemaVersion: 2, mediaType: manifestType, config, layers: [] }, manifestType)
    if (![2, 3].includes(index)) return selected
    const foreign = { mediaType: manifestType, digest: `sha256:${"c".repeat(64)}`, size: 100, platform: { os: "linux", architecture: architecture === "arm64" ? "amd64" : "arm64" } }
    return put({ schemaVersion: 2, mediaType: indexType, manifests: [{ ...selected, platform: { os: "linux", architecture } }, foreign] }, indexType)
  })
  const entries = configDescriptors.map((config, index) => ({ Config: `blobs/sha256/${config.digest.slice(7)}`, RepoTags: [refs[index]], Layers: [] }))
  const model = { index: { schemaVersion: 2, mediaType: indexType, manifests: roots.map((descriptor, index) => ({ ...descriptor, annotations: { "io.containerd.image.name": index >= 2 ? `docker.io/${refs[index]}` : refs[index] } })) }, blobs, put }
  changeGraph(model)
  for (const [name, bytes] of blobs) {
    const target = path.join(directory, name)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, bytes)
  }
  writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(transform(entries)))
  const archiveFiles = ["manifest.json", ...blobs.keys()]
  if (model.index) {
    writeFileSync(path.join(directory, "index.json"), JSON.stringify(model.index))
    archiveFiles.push("index.json")
  }
  const archive = path.join(directory, "images.tar")
  execFileSync("tar", ["-cf", archive, "-C", directory, ...archiveFiles], { env: { ...process.env, LC_ALL: "C" } })
  const ids = path.join(directory, "images.ids")
  const provenance = path.join(directory, "provenance.json")
  const arguments_ = [script, "--version", version, "--platform", "linux/arm64", "--archive", archive,
    "--ids", ids, "--provenance", provenance, "--caddy-source", `caddy:2.10.2-alpine@sha256:${"a".repeat(64)}`,
    "--source-commit", "b".repeat(40), "--source-dirty", "false"]
  return { ids, provenance, configDescriptors, roots, run: () => spawnSync(process.execPath, arguments_, { encoding: "utf8" }) }
}

function rejected(f) {
  const result = f.run()
  assert.notEqual(result.status, 0)
  assert.equal(existsSync(f.ids), false)
}

test("config and tagged descriptor IDs are bound to one selected OCI graph", (t) => {
  const f = fixture(t)
  assert.equal(f.run().status, 0)
  const expected = refs.map((ref, index) => `${f.configDescriptors[index].digest},${f.roots[index].digest}  ${ref}\n`).join("")
  assert.equal(readFileSync(f.ids, "utf8"), expected)
  const provenance = JSON.parse(readFileSync(f.provenance, "utf8"))
  assert.equal(provenance.platform, "linux/arm64")
  assert.equal(provenance.images.length, 5)
  assert.equal(provenance.images[2].descriptorId, f.roots[2].digest)
  assert.equal(provenance.images[2].configId, f.configDescriptors[2].digest)
  assert.equal(provenance.source.workingTreeDirty, false)
})

test("wrong architecture cannot produce release metadata", (t) => rejected(fixture(t, undefined, "amd64")))

test("missing or duplicated image references are rejected", (t) => {
  for (const transform of [(entries) => entries.slice(1), (entries) => entries.map((entry) => ({ ...entry, RepoTags: [refs[0]] }))]) rejected(fixture(t, transform))
})

test("metadata cannot request paths outside the archive", (t) => {
  rejected(fixture(t, (entries) => [{ ...entries[0], Config: "../outside.json" }, ...entries.slice(1)]))
})

test("a legacy archive without OCI tagged descriptors is rejected explicitly", (t) => {
  const f = fixture(t, undefined, "arm64", (model) => { model.index = null })
  const result = f.run()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /OCI index.json is required/)
  assert.equal(existsSync(f.ids), false)
})

test("descriptor bytes and declared size are authenticated", (t) => {
  rejected(fixture(t, undefined, "arm64", (model) => {
    const root = model.index.manifests[0]
    const name = `blobs/sha256/${root.digest.slice(7)}`
    model.blobs.set(name, Buffer.concat([model.blobs.get(name), Buffer.from(" ")]))
  }))
  rejected(fixture(t, undefined, "arm64", (model) => { model.index.manifests[0].size += 1 }))
})

test("a correct image-name annotation cannot disguise the wrong config graph", (t) => {
  rejected(fixture(t, undefined, "arm64", (model) => {
    const original = model.index.manifests[0]
    model.index.manifests[0] = { ...model.index.manifests[1], annotations: original.annotations }
  }))
})

test("an index with no selected platform cannot identify an image", (t) => {
  rejected(fixture(t, undefined, "arm64", (model) => {
    const original = model.index.manifests[2]
    const data = JSON.parse(model.blobs.get(`blobs/sha256/${original.digest.slice(7)}`))
    data.manifests = data.manifests.filter((descriptor) => descriptor.platform.architecture !== "arm64")
    model.index.manifests[2] = { ...model.put(data, indexType), annotations: original.annotations }
  }))
})

test("OCI layers must agree with the selected legacy image entry", (t) => {
  rejected(fixture(t, undefined, "arm64", (model) => {
    const original = model.index.manifests[0]
    const data = JSON.parse(model.blobs.get(`blobs/sha256/${original.digest.slice(7)}`))
    data.layers = [{ mediaType: "application/vnd.oci.image.layer.v1.tar", digest: `sha256:${"d".repeat(64)}`, size: 1 }]
    model.index.manifests[0] = { ...model.put(data, manifestType), annotations: original.annotations }
  }))
})

test("existing output is never overwritten", (t) => {
  const f = fixture(t)
  writeFileSync(f.ids, "existing release metadata\n")
  assert.notEqual(f.run().status, 0)
  assert.equal(readFileSync(f.ids, "utf8"), "existing release metadata\n")
})

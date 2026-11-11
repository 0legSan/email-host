import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises"
import path from "node:path"

const args = process.argv.slice(2)
const options = new Map()
for (let i = 0; i < args.length; i += 2) {
  if (!["--root", "--output"].includes(args[i]) || !args[i + 1]) {
    throw new Error("Usage: collect-third-party-licenses.mjs --root node_modules --output DIR")
  }
  options.set(args[i], args[i + 1])
}
if (!options.has("--root") || !options.has("--output")) {
  throw new Error("Both --root and --output are required")
}

const packages = new Map()
const visited = new Set()

async function packageAt(directory) {
  const resolved = await realpath(directory)
  if (packages.has(resolved)) return
  let metadata
  try {
    metadata = JSON.parse(await readFile(path.join(resolved, "package.json"), "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return
    throw error
  }
  // Workspace sources have their own root license and are not third-party code.
  if (metadata.name?.startsWith("@workspace/")) return
  packages.set(resolved, metadata)
  await nodeModules(path.join(resolved, "node_modules"))
}

async function nodeModules(directory) {
  let resolved
  try {
    resolved = await realpath(directory)
  } catch (error) {
    if (error.code === "ENOENT") return
    throw error
  }
  if (visited.has(resolved)) return
  visited.add(resolved)
  for (const entry of await readdir(resolved, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const candidate = path.join(resolved, entry.name)
    if (entry.name === ".bun") {
      for (const stored of await readdir(candidate, { withFileTypes: true })) {
        if (stored.isDirectory()) await nodeModules(path.join(candidate, stored.name, "node_modules"))
      }
    } else if (entry.name.startsWith("@")) {
      for (const scoped of await readdir(candidate)) await packageAt(path.join(candidate, scoped))
    } else if (!entry.name.startsWith(".")) {
      await packageAt(candidate)
    }
  }
}

await nodeModules(path.resolve(options.get("--root")))
if (packages.size === 0) throw new Error("No installed packages found")
const inventory = []
const text = [
  "Third-party license inventory",
  "This inventory includes installed dependencies, including build tools where present.",
  "It is not a claim that every listed package is bundled into the application.",
  "Dependencies retain their own licenses. Missing license texts require review before publication.",
  "",
]
for (const [directory, metadata] of [...packages].sort((a, b) =>
  `${a[1].name}@${a[1].version}`.localeCompare(`${b[1].name}@${b[1].version}`)
)) {
  const license = typeof metadata.license === "string" ? metadata.license : metadata.license?.type ?? "UNSPECIFIED"
  const names = (await readdir(directory)).filter((name) => /^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(name))
  const documents = []
  for (const name of names) {
    const candidate = path.join(directory, name)
    const resolved = await realpath(candidate)
    if (!resolved.startsWith(`${directory}${path.sep}`)) continue
    if (!(await stat(resolved)).isFile()) continue
    documents.push(name)
    text.push(`===== ${metadata.name}@${metadata.version}: ${name} =====`, await readFile(resolved, "utf8"), "")
  }
  inventory.push({ name: metadata.name, version: metadata.version, license, documents })
}
const output = path.resolve(options.get("--output"))
await mkdir(output, { recursive: true })
await writeFile(path.join(output, "THIRD-PARTY-NOTICES.txt"), text.join("\n"))
await writeFile(path.join(output, "inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`)
console.log(`Collected ${inventory.length} packages; ${inventory.filter((item) => item.documents.length === 0).length} need license-text review.`)

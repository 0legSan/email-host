import { readdir } from "node:fs/promises"
import { extname, join, relative } from "node:path"

const projectRoot = process.cwd()
const sourceRoots = [
  "apps/web/src",
  "apps/site/src",
  "packages/mail-design/src",
  "packages/ui/src",
  "packages/editor-ui/src",
]
const checkedExtensions = new Set([".ts", ".tsx", ".css"])
const forbiddenMailDesignImports = [
  /from\s+["']@\//,
  /from\s+["'](?:\.\.\/)+\.\.\/apps\/web/,
  /from\s+["']@workspace\/mail-agent(?:\/|["'])/,
  /from\s+["']@workspace\/pwa(?:\/|["'])/,
  /from\s+["']@tanstack\/react-(?:query|router)(?:\/|["'])/,
  /from\s+["']convex(?:\/|["'])/,
]

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? listFiles(path) : Promise.resolve([path])
    })
  )

  return nestedFiles.flat()
}

const files = (
  await Promise.all(
    sourceRoots.map((root) => listFiles(join(projectRoot, root)))
  )
)
  .flat()
  .filter((file) => checkedExtensions.has(extname(file)))

const violations: string[] = []

for (const file of files) {
  const source = await Bun.file(file).text()
  const lineCount = source === "" ? 0 : source.split(/\r?\n/).length
  const projectPath = relative(projectRoot, file)

  if (lineCount > 1000) {
    violations.push(`${projectPath}: ${lineCount} lines (maximum 1000)`)
  }

  if (projectPath.startsWith("packages/mail-design/src/")) {
    for (const pattern of forbiddenMailDesignImports) {
      if (pattern.test(source)) {
        violations.push(`${projectPath}: forbidden dependency ${pattern}`)
      }
    }
  }

  if (
    projectPath.startsWith("apps/web/src/") &&
    /@workspace\/mail-design\/(?:src|components|hooks)\//.test(source)
  ) {
    violations.push(`${projectPath}: imports an internal mail-design path`)
  }
}

if (violations.length > 0) {
  console.error("Frontend architecture check failed:\n")
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log(`Frontend architecture check passed for ${files.length} files.`)

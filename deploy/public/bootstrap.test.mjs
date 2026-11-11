import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, statSync, unlinkSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const script = fileURLToPath(new URL("./bootstrap.mjs", import.meta.url))

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "email-host-bootstrap-test-"))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const generate = ["--output", directory, "--app-domain", "mail.example.test",
    "--convex-domain", "convex.example.test", "--convex-site-domain", "actions.example.test", "--version", "0.1.0-test"]
  const run = (args, input) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", input })
  return { directory, generate, run }
}

test("initial generation is private and repeat does not replace encryption keys", (t) => {
  const f = fixture(t)
  assert.equal(f.run(f.generate).status, 0)
  const env = readFileSync(path.join(f.directory, ".env"))
  const credentials = readFileSync(path.join(f.directory, "credentials.txt"))
  assert.equal(statSync(path.join(f.directory, ".env")).mode & 0o777, 0o600)
  assert.equal(statSync(path.join(f.directory, "credentials.txt")).mode & 0o777, 0o600)
  assert.notEqual(f.run(f.generate).status, 0)
  assert.ok(readFileSync(path.join(f.directory, ".env")).equals(env))
  assert.ok(readFileSync(path.join(f.directory, "credentials.txt")).equals(credentials))
  assert.ok(env.includes("CONVEX_INSTANCE_NAME='email-host-convex'"))
})

test("interrupted credential creation resumes without changing any configuration", (t) => {
  const f = fixture(t)
  assert.equal(f.run(f.generate).status, 0)
  const envPath = path.join(f.directory, ".env")
  const credentialsPath = path.join(f.directory, "credentials.txt")
  const env = readFileSync(envPath)
  const credentials = readFileSync(credentialsPath)
  unlinkSync(credentialsPath)
  const result = f.run(["--recover-credentials", "--output", f.directory])
  assert.equal(result.status, 0)
  assert.ok(readFileSync(envPath).equals(env))
  assert.ok(readFileSync(credentialsPath).equals(credentials))
  assert.equal(statSync(credentialsPath).mode & 0o777, 0o600)
  const password = /Password: ([^\n]+)/.exec(credentials.toString())[1]
  assert.ok(!result.stdout.includes(password))
  assert.notEqual(f.run(["--recover-credentials", "--output", f.directory]).status, 0)
})

test("admin-key retry is idempotent and cannot replace an existing key", (t) => {
  const f = fixture(t)
  assert.equal(f.run(f.generate).status, 0)
  const args = ["--set-admin-key", "--output", f.directory]
  assert.equal(f.run(args, "test-key-one-123456").status, 0)
  const env = readFileSync(path.join(f.directory, ".env"))
  assert.equal(f.run(args, "test-key-one-123456").status, 0)
  assert.notEqual(f.run(args, "test-key-other-123456").status, 0)
  assert.ok(readFileSync(path.join(f.directory, ".env")).equals(env))
})

test("invalid and duplicate domains are rejected before credentials exist", (t) => {
  for (const domain of ["https://mail.example.test", "mail.example.test;id", "mail..example.test", "convex.example.test"]) {
    const f = fixture(t)
    const args = [...f.generate]
    args[args.indexOf("--app-domain") + 1] = domain
    assert.notEqual(f.run(args).status, 0)
    assert.throws(() => statSync(path.join(f.directory, ".env")), { code: "ENOENT" })
  }
})

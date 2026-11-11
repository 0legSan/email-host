import { exportJWK, exportPKCS8, generateKeyPair } from "jose"

const keyId = crypto.randomUUID()
const { privateKey, publicKey } = await generateKeyPair("RS256", {
  extractable: true,
})
const privateKeyPem = await exportPKCS8(privateKey)
const publicJwk = await exportJWK(publicKey)

console.log(`CONVEX_JWT_KEY_ID=${keyId}`)
console.log(`CONVEX_JWT_PRIVATE_KEY=${JSON.stringify(privateKeyPem)}`)
console.log(`CONVEX_JWT_PUBLIC_JWK=${JSON.stringify(JSON.stringify(publicJwk))}`)

import { md5 } from 'js-md5'

export type HashAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512'

export async function hashValue(text: string, algo: HashAlgorithm): Promise<string> {
  if (algo === 'MD5') return md5(text)
  const digest = await globalThis.crypto.subtle.digest(algo, new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function uuid4(n: number): string[] {
  return Array.from({ length: n }, () => globalThis.crypto.randomUUID())
}

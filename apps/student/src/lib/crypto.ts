/** SHA-256 passphrase hashing via the Web Crypto API (available in both browser and Tauri). */

export async function hashPassphrase(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPassphrase(text: string, hash: string): Promise<boolean> {
  const textHash = await hashPassphrase(text);
  return textHash === hash;
}

const ALGORITHM = "AES-GCM";

export async function deriveKey(masterPassword: string, salt: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(masterPassword);
  const saltData = encoder.encode(salt);

  const baseKey = await crypto.subtle.importKey(
    "raw",
    passwordData,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltData,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(text: string, key: CryptoKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  const encryptedArray = new Uint8Array(encryptedBuffer);
  // AES-GCM in Web Crypto API appends the tag to the ciphertext
  const tagLength = 16;
  const encrypted = encryptedArray.slice(0, -tagLength);
  const tag = encryptedArray.slice(-tagLength);

  return {
    encrypted: b64Encode(encrypted),
    iv: b64Encode(iv),
    tag: b64Encode(tag)
  };
}

export async function decrypt(encryptedB64: string, key: CryptoKey, ivB64: string, tagB64: string): Promise<string> {
  const encrypted = b64Decode(encryptedB64);
  const iv = b64Decode(ivB64);
  const tag = b64Decode(tagB64);

  const combined = new Uint8Array(encrypted.length + tag.length);
  combined.set(encrypted);
  combined.set(tag, encrypted.length);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    combined
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

function b64Encode(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function b64Decode(str: string): Uint8Array {
  const binary = atob(str);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Self-custody wallet created on the player's device (MASTERPLAN §5).
 *  - BIP-39 12-word recovery phrase, generated locally.
 *  - Stored only as an encrypted keystore in IndexedDB (PBKDF2-SHA256 → AES-GCM),
 *    protected by the player's password.
 *  - The key never leaves the device. The server only sees the address and signatures.
 */
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { mnemonicToAccount, type HDAccount } from 'viem/accounts';
import { bytesToHex } from 'viem';

const DB_NAME = 'rig-valley';
const STORE = 'keystore';
const KEY = 'default';
const PBKDF2_ITERATIONS = 600_000;

export interface KeystoreRecord {
  version: 1;
  address: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  ciphertext: string;
  createdAt: string;
}

export function newRecoveryPhrase(): string[] {
  return generateMnemonic(wordlist, 128).split(' ');
}

export function normalizePhrase(input: string): string {
  return input.trim().toLowerCase().split(/\s+/).join(' ');
}

export function isValidPhrase(phrase: string): boolean {
  const p = normalizePhrase(phrase);
  return p.split(' ').length === 12 && validateMnemonic(p, wordlist);
}

export function isRecoveryWord(w: string): boolean {
  return wordlist.includes(w.trim().toLowerCase());
}

export function accountFromPhrase(phrase: string): HDAccount {
  return mnemonicToAccount(normalizePhrase(phrase));
}

export function privateKeyOf(account: HDAccount): `0x${string}` {
  const pk = account.getHdKey().privateKey;
  if (!pk) throw new Error('No private key');
  return bytesToHex(pk);
}

// ------------------------------------------------------------------ crypto
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptPhrase(phrase: string, password: string): Promise<KeystoreRecord> {
  const normalized = normalizePhrase(phrase);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(normalized)),
  );
  return {
    version: 1,
    address: accountFromPhrase(normalized).address,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: b64(salt) },
    cipher: { name: 'AES-GCM', iv: b64(iv) },
    ciphertext: b64(ct),
    createdAt: new Date().toISOString(),
  };
}

/** Throws "Wrong password." if the password doesn't decrypt the keystore. */
export async function decryptPhrase(rec: KeystoreRecord, password: string): Promise<string> {
  const key = await deriveKey(password, unb64(rec.kdf.salt), rec.kdf.iterations);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(rec.cipher.iv) as BufferSource },
      key,
      unb64(rec.ciphertext) as BufferSource,
    );
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error('Wrong password.');
  }
}

// ------------------------------------------------------------------ IndexedDB
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export async function loadKeystore(): Promise<KeystoreRecord | null> {
  try {
    return (await tx<KeystoreRecord | undefined>('readonly', (s) => s.get(KEY))) ?? null;
  } catch {
    return null;
  }
}

export async function saveKeystore(rec: KeystoreRecord): Promise<void> {
  await tx('readwrite', (s) => s.put(rec, KEY));
}

export async function deleteKeystore(): Promise<void> {
  await tx('readwrite', (s) => s.delete(KEY));
}

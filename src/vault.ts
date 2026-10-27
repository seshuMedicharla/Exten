/** Local encrypted password-hint vault. Only the ciphertext envelope is persisted. */
export const VAULT_STORAGE_KEY = 'exaisec.encryptedHintVault';
export const VAULT_VERSION = 1;
/** PBKDF2-HMAC-SHA-256 work factor; intentionally fixed for format version 1. */
export const PBKDF2_ITERATIONS = 600_000;
export const MAX_VAULT_ENTRIES = 100;
export const MAX_LABEL_LENGTH = 80;
export const MAX_HINT_LENGTH = 500;
const MAX_CIPHERTEXT_LENGTH = 1_000_000;
function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
const AAD = copyToArrayBuffer(new TextEncoder().encode(`ExAiSec|vault|v${VAULT_VERSION}|PBKDF2-SHA-256|${PBKDF2_ITERATIONS}|AES-256-GCM`));

export interface VaultEntry {
  id: string;
  label: string;
  hint: string;
  /** Exact normalized hostname; null means this hint is not scoped to a website. */
  hostname: string | null;
  updatedAt: number;
}

export interface VaultEnvelope {
  version: 1;
  kdf: { algorithm: 'PBKDF2'; hash: 'SHA-256'; iterations: 600000; salt: string };
  cipher: { algorithm: 'AES-256-GCM'; iv: string; ciphertext: string };
}

export interface VaultStorage {
  read(): Promise<unknown>;
  write(value: VaultEnvelope): Promise<void>;
}

export class VaultError extends Error {
  constructor(message: string, readonly code: 'exists' | 'missing' | 'invalid' | 'unlock' | 'locked' | 'storage' | 'entry') {
    super(message);
    this.name = 'VaultError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

export function normalizeVaultHostname(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 253 || /[\s/@?#]/.test(raw)) return null;
  if (raw.includes(':') && !(raw.startsWith('[') && raw.endsWith(']'))) return null;
  try {
    const parsed = new URL(`https://${raw}`);
    if (parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    return hostname && hostname.length <= 253 ? hostname : null;
  } catch { return null; }
}

export function isExactHostnameMatch(entryHostname: unknown, currentHostname: unknown): boolean {
  const entry = normalizeVaultHostname(entryHostname);
  const current = normalizeVaultHostname(currentHostname);
  return entry !== null && current !== null && entry === current;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value: unknown): Uint8Array {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new VaultError('Stored vault data is malformed.', 'invalid');
  }
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    if (bytesToBase64(bytes) !== value) throw new Error('Noncanonical base64');
    return bytes;
  } catch {
    throw new VaultError('Stored vault data is malformed.', 'invalid');
  }
}

export function validateVaultEnvelope(value: unknown): VaultEnvelope {
  if (!isObject(value) || !hasExactKeys(value, ['version', 'kdf', 'cipher']) || value.version !== VAULT_VERSION || !isObject(value.kdf) || !isObject(value.cipher) ||
      !hasExactKeys(value.kdf, ['algorithm', 'hash', 'iterations', 'salt']) || !hasExactKeys(value.cipher, ['algorithm', 'iv', 'ciphertext'])) {
    throw new VaultError('Stored vault data has an unsupported or invalid format.', 'invalid');
  }
  const { kdf, cipher } = value;
  if (kdf.algorithm !== 'PBKDF2' || kdf.hash !== 'SHA-256' || kdf.iterations !== PBKDF2_ITERATIONS ||
      cipher.algorithm !== 'AES-256-GCM') {
    throw new VaultError('Stored vault data has unsupported cryptographic settings.', 'invalid');
  }
  const salt = base64ToBytes(kdf.salt);
  const iv = base64ToBytes(cipher.iv);
  const ciphertext = base64ToBytes(cipher.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16 || ciphertext.length > MAX_CIPHERTEXT_LENGTH) {
    throw new VaultError('Stored vault data has invalid cryptographic fields.', 'invalid');
  }
  return value as unknown as VaultEnvelope;
}

function validateEntries(value: unknown): VaultEntry[] {
  if (!Array.isArray(value) || value.length > MAX_VAULT_ENTRIES) throw new VaultError('The encrypted vault contents are invalid.', 'invalid');
  const entries = value.map((item): VaultEntry => {
    if (!isObject(item) || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) ||
        typeof item.label !== 'string' || !item.label.trim() || item.label.length > MAX_LABEL_LENGTH ||
        typeof item.hint !== 'string' || !item.hint.trim() || item.hint.length > MAX_HINT_LENGTH ||
        (item.hostname !== undefined && item.hostname !== null && (typeof item.hostname !== 'string' || normalizeVaultHostname(item.hostname) !== item.hostname)) ||
        typeof item.updatedAt !== 'number' || !Number.isSafeInteger(item.updatedAt) || item.updatedAt < 0) {
      throw new VaultError('The encrypted vault contents are invalid.', 'invalid');
    }
    return { id: item.id, label: item.label, hint: item.hint, hostname: typeof item.hostname === 'string' ? item.hostname : null, updatedAt: item.updatedAt };
  });
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new VaultError('The encrypted vault contains duplicate records.', 'invalid');
  return entries;
}

function validateEntryFields(label: string, hint: string, hostname: string | null): { label: string; hint: string; hostname: string | null } {
  const safeLabel = label.trim();
  const safeHint = hint.trim();
  if (!safeLabel || safeLabel.length > MAX_LABEL_LENGTH || hasForbiddenControlCharacters(safeLabel, false)) {
    throw new VaultError(`Enter a label of 1–${MAX_LABEL_LENGTH} characters without control characters.`, 'entry');
  }
  if (!safeHint || safeHint.length > MAX_HINT_LENGTH || hasForbiddenControlCharacters(safeHint, true)) {
    throw new VaultError(`Enter a hint of 1–${MAX_HINT_LENGTH} characters.`, 'entry');
  }
  const safeHostname = hostname === null || hostname.trim() === '' ? null : normalizeVaultHostname(hostname);
  if (hostname !== null && hostname.trim() !== '' && !safeHostname) throw new VaultError('Enter a hostname only, such as example.com, or leave it blank.', 'entry');
  return { label: safeLabel, hint: safeHint, hostname: safeHostname };
}

function hasForbiddenControlCharacters(value: string, allowLineBreaks: boolean): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code === 0x7f || (code < 0x20 && !(allowLineBreaks && (code === 0x09 || code === 0x0a || code === 0x0d)))) return true;
  }
  return false;
}

async function deriveKey(passphrase: string, salt: Uint8Array, cryptoApi: Crypto): Promise<CryptoKey> {
  const encodedPassphrase = new TextEncoder().encode(passphrase);
  const rawKeyMaterial = copyToArrayBuffer(encodedPassphrase);
  encodedPassphrase.fill(0);
  let material: CryptoKey;
  try { material = await cryptoApi.subtle.importKey('raw', rawKeyMaterial, 'PBKDF2', false, ['deriveKey']); }
  finally { new Uint8Array(rawKeyMaterial).fill(0); }
  return cryptoApi.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: copyToArrayBuffer(salt), iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptEntries(entries: readonly VaultEntry[], key: CryptoKey, salt: Uint8Array, cryptoApi: Crypto): Promise<VaultEnvelope> {
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(entries));
  const plaintextBuffer = copyToArrayBuffer(plaintext);
  let encrypted: ArrayBuffer;
  try { encrypted = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv: copyToArrayBuffer(iv), additionalData: AAD, tagLength: 128 }, key, plaintextBuffer); }
  finally { plaintext.fill(0); new Uint8Array(plaintextBuffer).fill(0); }
  return {
    version: VAULT_VERSION,
    kdf: { algorithm: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: bytesToBase64(salt) },
    cipher: { algorithm: 'AES-256-GCM', iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(encrypted)) },
  };
}

async function decryptEntries(envelope: VaultEnvelope, key: CryptoKey, cryptoApi: Crypto): Promise<VaultEntry[]> {
  let plaintext: ArrayBuffer | undefined;
  try {
    plaintext = await cryptoApi.subtle.decrypt(
      { name: 'AES-GCM', iv: copyToArrayBuffer(base64ToBytes(envelope.cipher.iv)), additionalData: AAD, tagLength: 128 },
      key,
      copyToArrayBuffer(base64ToBytes(envelope.cipher.ciphertext)),
    );
    return validateEntries(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)) as unknown);
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError('The passphrase is incorrect or the encrypted vault has been changed. No data was overwritten.', 'unlock');
  } finally { if (plaintext) new Uint8Array(plaintext).fill(0); }
}

function requirePassphrase(passphrase: string): void {
  if (!passphrase || passphrase.length > 1024) throw new VaultError('Enter a non-empty passphrase (up to 1,024 characters).', 'entry');
}

export class VaultSession {
  private key: CryptoKey | undefined;
  private entries: VaultEntry[];
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly storage: VaultStorage,
    key: CryptoKey,
    private readonly salt: Uint8Array,
    entries: VaultEntry[],
    private readonly cryptoApi: Crypto,
  ) {
    this.key = key;
    this.entries = entries;
  }

  static async create(passphrase: string, storage: VaultStorage, cryptoApi: Crypto = globalThis.crypto): Promise<VaultSession> {
    requirePassphrase(passphrase);
    const existing = await storage.read();
    if (existing !== undefined) throw new VaultError('A vault already exists. Unlock it instead; setup will not replace stored data.', 'exists');
    const salt = cryptoApi.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passphrase, salt, cryptoApi);
    const entries: VaultEntry[] = [];
    const envelope = await encryptEntries(entries, key, salt, cryptoApi);
    await storage.write(envelope);
    return new VaultSession(storage, key, salt, entries, cryptoApi);
  }

  static async unlock(passphrase: string, storage: VaultStorage, cryptoApi: Crypto = globalThis.crypto): Promise<VaultSession> {
    requirePassphrase(passphrase);
    let stored: unknown;
    try { stored = await storage.read(); }
    catch { throw new VaultError('The encrypted vault could not be read from extension storage.', 'storage'); }
    if (stored === undefined) throw new VaultError('No vault exists yet. Create one first.', 'missing');
    const envelope = validateVaultEnvelope(stored);
    const salt = base64ToBytes(envelope.kdf.salt);
    const key = await deriveKey(passphrase, salt, cryptoApi);
    const entries = await decryptEntries(envelope, key, cryptoApi);
    return new VaultSession(storage, key, salt, entries, cryptoApi);
  }

  list(): VaultEntry[] {
    this.requireUnlocked();
    return this.entries.map((entry) => ({ ...entry }));
  }

  add(label: string, hint: string, hostname: string | null = null): Promise<void> {
    const fields = validateEntryFields(label, hint, hostname);
    return this.enqueue(async () => {
      const current = this.requireUnlocked();
      if (this.entries.length >= MAX_VAULT_ENTRIES) throw new VaultError(`The vault can contain up to ${MAX_VAULT_ENTRIES} hints.`, 'entry');
      const next = [...this.entries, { id: this.cryptoApi.randomUUID(), ...fields, updatedAt: Date.now() }];
      await this.persist(next, current);
    });
  }

  update(id: string, label: string, hint: string, hostname: string | null = null): Promise<void> {
    const fields = validateEntryFields(label, hint, hostname);
    return this.enqueue(async () => {
      const current = this.requireUnlocked();
      if (!this.entries.some((entry) => entry.id === id)) throw new VaultError('That hint is no longer available.', 'entry');
      const next = this.entries.map((entry) => entry.id === id ? { ...entry, ...fields, updatedAt: Date.now() } : entry);
      await this.persist(next, current);
    });
  }

  delete(id: string): Promise<void> {
    return this.enqueue(async () => {
      const current = this.requireUnlocked();
      if (!this.entries.some((entry) => entry.id === id)) throw new VaultError('That hint is no longer available.', 'entry');
      await this.persist(this.entries.filter((entry) => entry.id !== id), current);
    });
  }

  lock(): void {
    this.key = undefined;
    this.entries = [];
  }

  private requireUnlocked(): CryptoKey {
    if (!this.key) throw new VaultError('The vault is locked. Unlock it to continue.', 'locked');
    return this.key;
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async persist(next: VaultEntry[], key: CryptoKey): Promise<void> {
    const envelope = await encryptEntries(next, key, this.salt, this.cryptoApi);
    if (this.key !== key) throw new VaultError('The vault was locked before this change could be saved.', 'locked');
    try { await this.storage.write(envelope); }
    catch { throw new VaultError('The encrypted hint could not be saved. Your existing vault data was kept.', 'storage'); }
    if (this.key === key) this.entries = next;
  }
}

export async function inspectStoredVault(storage: VaultStorage): Promise<'empty' | 'available'> {
  let stored: unknown;
  try { stored = await storage.read(); }
  catch { throw new VaultError('ExAiSec could not read extension storage.', 'storage'); }
  if (stored === undefined) return 'empty';
  validateVaultEnvelope(stored);
  return 'available';
}

export const chromeVaultStorage: VaultStorage = {
  async read() {
    const stored = await chrome.storage.local.get(VAULT_STORAGE_KEY);
    return stored[VAULT_STORAGE_KEY];
  },
  async write(value) {
    await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: value });
  },
};

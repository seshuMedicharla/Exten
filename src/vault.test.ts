import { describe, expect, it } from 'vitest';
import { isExactHostnameMatch, normalizeVaultHostname, PBKDF2_ITERATIONS, VAULT_STORAGE_KEY, VaultError, VaultSession, inspectStoredVault, type VaultEnvelope, type VaultStorage } from './vault';

class MemoryStorage implements VaultStorage {
  value: unknown;
  async read(): Promise<unknown> { return structuredClone(this.value); }
  async write(value: VaultEnvelope): Promise<void> { this.value = structuredClone(value); }
}

const secret = 'a remembered phrase for local hints';
function envelope(storage: MemoryStorage): VaultEnvelope { return storage.value as VaultEnvelope; }
function flipCiphertextBit(value: string): string {
  const raw = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  raw[0] ^= 1;
  let binary = ''; for (const byte of raw) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('encrypted password hint vault', () => {
  it('creates a versioned empty vault using the documented KDF settings', async () => {
    const storage = new MemoryStorage();
    const session = await VaultSession.create(secret, storage);
    expect(session.list()).toEqual([]);
    expect(envelope(storage)).toMatchObject({
      version: 1,
      kdf: { algorithm: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS },
      cipher: { algorithm: 'AES-256-GCM' },
    });
    expect(envelope(storage).cipher.iv).toHaveLength(16); // 12 random bytes encoded as base64.
  });

  it('decrypts with the correct passphrase and rejects a wrong one without replacing data', async () => {
    const storage = new MemoryStorage();
    const session = await VaultSession.create(secret, storage);
    await session.add('Personal email', 'A hint with no account secret');
    const before = JSON.stringify(storage.value);
    await expect(VaultSession.unlock('incorrect phrase', storage)).rejects.toMatchObject({ code: 'unlock' });
    expect(JSON.stringify(storage.value)).toBe(before);
    expect((await VaultSession.unlock(secret, storage)).list()[0]).toMatchObject({ label: 'Personal email', hint: 'A hint with no account secret' });
  });

  it('uses a fresh random IV for every encrypted payload update', async () => {
    const storage = new MemoryStorage();
    const session = await VaultSession.create(secret, storage);
    const first = envelope(storage);
    await session.add('Work account', 'Remember the work profile');
    const second = envelope(storage);
    expect(second.cipher.iv).not.toBe(first.cipher.iv);
    expect(second.kdf.salt).toBe(first.kdf.salt);
  });

  it('detects ciphertext tampering through AES-GCM authentication', async () => {
    const storage = new MemoryStorage();
    await VaultSession.create(secret, storage);
    const modified = envelope(storage);
    storage.value = { ...modified, cipher: { ...modified.cipher, ciphertext: flipCiphertextBit(modified.cipher.ciphertext) } };
    await expect(VaultSession.unlock(secret, storage)).rejects.toMatchObject({ code: 'unlock' });
  });

  it('treats malformed storage as corrupt and never as an empty vault', async () => {
    const storage = new MemoryStorage();
    storage.value = { version: 77, plaintext: 'not a vault' };
    await expect(inspectStoredVault(storage)).rejects.toMatchObject({ code: 'invalid' });
    await expect(VaultSession.create(secret, storage)).rejects.toMatchObject({ code: 'exists' });
    expect(storage.value).toEqual({ version: 77, plaintext: 'not a vault' });
  });

  it('adds, edits, and deletes hints by re-encrypting the whole payload', async () => {
    const storage = new MemoryStorage();
    const session = await VaultSession.create(secret, storage);
    await session.add('Old label', 'Old non-secret hint');
    const id = session.list()[0].id;
    await session.update(id, 'New label', 'Updated non-secret hint');
    expect(session.list()).toMatchObject([{ id, label: 'New label', hint: 'Updated non-secret hint' }]);
    await session.delete(id);
    expect(session.list()).toEqual([]);
  });

  it('persists across a simulated page restart and keeps sensitive text out of storage', async () => {
    const storage = new MemoryStorage();
    const session = await VaultSession.create(secret, storage);
    await session.add('Example account label', 'Example private reminder', 'example.com');
    const persisted = JSON.stringify(storage.value);
    expect(persisted).not.toContain(secret);
    expect(persisted).not.toContain('Example account label');
    expect(persisted).not.toContain('Example private reminder');
    expect(persisted).not.toContain('example.com');
    expect(JSON.stringify(await storage.read())).not.toContain(VAULT_STORAGE_KEY);
    session.lock();
    const reopened = await VaultSession.unlock(secret, storage);
    expect(reopened.list()).toMatchObject([{ label: 'Example account label', hint: 'Example private reminder', hostname: 'example.com' }]);
  });

  it('can inspect vault availability without unlocking or exposing entries', async () => {
    const storage = new MemoryStorage();
    const session = await VaultSession.create(secret, storage);
    await session.add('Private label', 'Private hint');
    session.lock();
    const before = JSON.stringify(storage.value);
    await expect(inspectStoredVault(storage)).resolves.toBe('available');
    expect(JSON.stringify(storage.value)).toBe(before);
  });

  it('clears decrypted records on lock and blocks further access', async () => {
    const storage = new MemoryStorage();
    const session = await VaultSession.create(secret, storage);
    await session.add('Bank', 'A non-secret reminder');
    session.lock();
    expect(() => session.list()).toThrowError(VaultError);
    await expect(session.add('Other', 'Reminder')).rejects.toMatchObject({ code: 'locked' });
  });

  it('normalizes and matches only the exact hostname', () => {
    expect(normalizeVaultHostname('  EXAMPLE.com. ')).toBe('example.com');
    expect(isExactHostnameMatch('example.com', 'EXAMPLE.com')).toBe(true);
    expect(isExactHostnameMatch('example.com', 'login.example.com')).toBe(false);
    expect(isExactHostnameMatch('example.com', 'example.co')).toBe(false);
    expect(normalizeVaultHostname('https://example.com/path')).toBe(null);
  });

  it('rejects an empty passphrase but imposes no strength score', async () => {
    const storage = new MemoryStorage();
    await expect(VaultSession.create('', storage)).rejects.toMatchObject({ code: 'entry' });
    const session = await VaultSession.create('x', storage);
    expect(session.list()).toEqual([]);
  });
});

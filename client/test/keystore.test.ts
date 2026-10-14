import { describe, expect, it } from 'vitest';
import {
  accountFromPhrase,
  decryptPhrase,
  encryptPhrase,
  isValidPhrase,
  newRecoveryPhrase,
  privateKeyOf,
} from '../src/wallet/keystore';

describe('on-device wallet', () => {
  it('generates valid 12-word recovery phrases', () => {
    const words = newRecoveryPhrase();
    expect(words).toHaveLength(12);
    expect(isValidPhrase(words.join(' '))).toBe(true);
    expect(isValidPhrase('apple '.repeat(12))).toBe(false);
  });

  it('encrypts with a password and decrypts only with the same password', async () => {
    const phrase = newRecoveryPhrase().join(' ');
    const rec = await encryptPhrase(phrase, 'correct horse battery');
    expect(rec.ciphertext).not.toContain(phrase.split(' ')[0]);
    expect(rec.address).toBe(accountFromPhrase(phrase).address);
    expect(await decryptPhrase(rec, 'correct horse battery')).toBe(phrase);
    await expect(decryptPhrase(rec, 'wrong password')).rejects.toThrow('Wrong password.');
  }, 30_000);

  it('derives the standard first account and exports its key', () => {
    // Well-known test vector ("test test … junk", anvil account #0).
    const acct = accountFromPhrase('test test test test test test test test test test test junk');
    expect(acct.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    expect(privateKeyOf(acct)).toBe(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    );
  });
});

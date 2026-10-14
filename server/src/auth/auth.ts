/**
 * Sign-In With Ethereum (MASTERPLAN §2, §5). Free signature, no gas.
 * The server only ever sees the address and signatures — never a private key.
 */
import { createHash, randomBytes } from 'node:crypto';
import { getAddress, verifyMessage, type Hex } from 'viem';
import { generateSiweNonce, parseSiweMessage, validateSiweMessage } from 'viem/siwe';
import type { Db } from '../db/index.js';
import { fail } from '../errors.js';

export interface AuthOptions {
  domain: string;
  uri: string;
  sessionDays: number;
  /** Optional verifier for smart-contract wallets (ERC-1271/6492) via RPC. */
  verifyContractSignature?: (args: {
    address: Hex;
    message: string;
    signature: Hex;
  }) => Promise<boolean>;
}

const NONCE_TTL_MS = 10 * 60 * 1000;

export class AuthService {
  constructor(
    private db: Db,
    private opts: AuthOptions,
  ) {}

  async createNonce(): Promise<string> {
    const nonce = generateSiweNonce();
    await this.db.query('INSERT INTO auth_nonces (nonce, expires_at) VALUES ($1, $2)', [
      nonce,
      new Date(Date.now() + NONCE_TTL_MS).toISOString(),
    ]);
    await this.db.query('DELETE FROM auth_nonces WHERE expires_at < now()');
    return nonce;
  }

  /** Verify a SIWE message + signature. Returns the checksummed address. */
  async verify(message: string, signature: Hex): Promise<string> {
    if (typeof message !== 'string' || message.length > 4000)
      fail('bad_message', 'That sign-in message looks wrong.', 401);
    const parsed = parseSiweMessage(message);
    if (!parsed.address || !parsed.nonce)
      fail('bad_message', 'That sign-in message looks wrong.', 401);

    // Nonce must exist and is single-use.
    const used = await this.db.query<{ nonce: string }>(
      'DELETE FROM auth_nonces WHERE nonce = $1 AND expires_at > now() RETURNING nonce',
      [parsed.nonce],
    );
    if (used.rows.length === 0) fail('bad_nonce', 'Your sign-in expired. Please try again.', 401);

    const valid = validateSiweMessage({
      message: parsed,
      domain: this.opts.domain,
      nonce: parsed.nonce,
      time: new Date(),
    });
    if (!valid || parsed.uri !== this.opts.uri)
      fail('bad_message', 'This sign-in request was made for a different site.', 401);

    const address = getAddress(parsed.address);
    let ok = false;
    try {
      ok = await verifyMessage({ address, message, signature });
    } catch {
      ok = false;
    }
    if (!ok && this.opts.verifyContractSignature) {
      ok = await this.opts
        .verifyContractSignature({ address, message, signature })
        .catch(() => false);
    }
    if (!ok) fail('bad_signature', "That signature doesn't match your wallet.", 401);
    return address;
  }

  async createSession(address: string): Promise<{ token: string; expires: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + this.opts.sessionDays * 86400_000);
    await this.db.query(
      'INSERT INTO sessions (token_hash, address, expires_at) VALUES ($1, $2, $3)',
      [hash(token), address.toLowerCase(), expires.toISOString()],
    );
    return { token, expires };
  }

  async sessionAddress(token: string | undefined): Promise<string | null> {
    if (!token || token.length > 200) return null;
    const r = await this.db.query<{ address: string }>(
      'SELECT address FROM sessions WHERE token_hash = $1 AND expires_at > now()',
      [hash(token)],
    );
    return r.rows[0]?.address ?? null;
  }

  async destroySession(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.db.query('DELETE FROM sessions WHERE token_hash = $1', [hash(token)]);
  }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

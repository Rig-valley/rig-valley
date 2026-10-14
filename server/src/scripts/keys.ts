/**
 * Generates the two server keys for a real deployment and stores them in a git-ignored
 * file. Private keys are never printed — only the public addresses.
 *
 *   VOUCHER_SIGNER_KEY   signs withdrawal vouchers (holds no funds; its address goes on the contract)
 *   RELAYER_PRIVATE_KEY  deploys the contract, then only ever calls claim() to sponsor gas
 *                        (fund it with a little ETH on Robinhood Chain)
 *
 * Usage: pnpm --filter @rig-valley/server keys
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const out = join(repo, '.data', 'mainnet-keys.env');

if (existsSync(out)) {
  console.error(`Refusing to overwrite ${out}. Move it away first if you really want new keys.`);
  process.exit(1);
}

const signer = generatePrivateKey();
const relayer = generatePrivateKey();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  [
    '# Rig Valley mainnet keys. NEVER commit or share this file. Back it up offline.',
    `VOUCHER_SIGNER_KEY=${signer}`,
    `RELAYER_PRIVATE_KEY=${relayer}`,
    '',
  ].join('\n'),
  { mode: 0o600 },
);

console.log(`Keys written to ${out}`);
console.log(`Voucher signer address: ${privateKeyToAccount(signer).address}`);
console.log(
  `Relayer / deployer address (fund with a little ETH): ${privateKeyToAccount(relayer).address}`,
);

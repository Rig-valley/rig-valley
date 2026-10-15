/**
 * Proves a real deployment end to end without spending real tokens.
 *
 * Start a local fork of Robinhood Chain mainnet first:
 *   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8546 --chain-id 4663
 *
 * Then: pnpm --filter @rig-valley/server exec tsx src/scripts/mainnet-fork-check.ts
 *
 * On the fork it borrows NVDA from a large holder, funds the deployed distributor, signs a
 * voucher with the real voucher-signer key, relays the claim with the real relayer key, and
 * checks balances, the daily budget and the per-claim cap. Nothing touches mainnet itself.
 * Keys are read from .data/mainnet-keys.env and never printed.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestClient, formatUnits, http, parseUnits, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { DISTRIBUTOR_ABI, ERC20_ABI } from '@rig-valley/shared';
import { loadConfig } from '../config.js';
import { createChainService } from '../rewards/chain.js';

const FORK_RPC = process.env.FORK_RPC ?? 'http://127.0.0.1:8546';
const DISTRIBUTOR = (process.env.DISTRIBUTOR_ADDRESS ??
  '0xEFFE93119Ad8B4C3dFBe7454E6F27097ADD6c78F') as Address;
const TOKEN = '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC' as Address;
const WHALE = (process.env.WHALE ?? '0xd4eb21209c4d6093f80b5b84f5c45cc093ea14a3') as Address;

const repo = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const keys = Object.fromEntries(
  readFileSync(join(repo, '.data/mainnet-keys.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);

const cfg = loadConfig({
  ...process.env,
  NODE_ENV: 'development',
  CHAIN_ID: '4663',
  CHAIN_NAME: 'Robinhood Chain (fork)',
  RPC_URL: FORK_RPC,
  NVDA_TOKEN_ADDRESS: TOKEN,
  DISTRIBUTOR_ADDRESS: DISTRIBUTOR,
  VOUCHER_SIGNER_KEY: keys.VOUCHER_SIGNER_KEY,
  RELAYER_PRIVATE_KEY: keys.RELAYER_PRIVATE_KEY,
});
const maybeChain = createChainService(cfg);
if (!maybeChain) throw new Error('Chain config incomplete');
const chain = maybeChain;
const pub = chain.public;
const test = createTestClient({ mode: 'anvil', transport: http(FORK_RPC) });

const ok = (label: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) process.exitCode = 1;
};
const bal = (a: Address) =>
  pub.readContract({ address: TOKEN, abi: ERC20_ABI, functionName: 'balanceOf', args: [a] });
const nvda = (v: bigint) => `${formatUnits(v, 18)} NVDA`;

async function main() {
  ok('fork is Robinhood Chain mainnet (4663)', (await pub.getChainId()) === 4663);

  // The deployed contract, as configured on mainnet.
  const [signer, token, paused] = await Promise.all([
    pub.readContract({ address: DISTRIBUTOR, abi: DISTRIBUTOR_ABI, functionName: 'voucherSigner' }),
    pub.readContract({ address: DISTRIBUTOR, abi: DISTRIBUTOR_ABI, functionName: 'token' }),
    pub.readContract({ address: DISTRIBUTOR, abi: DISTRIBUTOR_ABI, functionName: 'paused' }),
  ]);
  ok(
    'contract voucherSigner = our server key',
    signer.toLowerCase() ===
      privateKeyToAccount(keys.VOUCHER_SIGNER_KEY as Hex).address.toLowerCase(),
  );
  ok('contract token = official NVDA', token.toLowerCase() === TOKEN.toLowerCase());
  ok('contract not paused', paused === false);

  // Fund the pool on the fork from a large holder (impersonated; fork only).
  const fund = parseUnits('0.3', 18);
  await test.impersonateAccount({ address: WHALE });
  await test.setBalance({ address: WHALE, value: parseUnits('1', 18) });
  const fundTx = await test.request({
    method: 'eth_sendTransaction' as never,
    params: [
      {
        from: WHALE,
        to: TOKEN,
        data: ('0xa9059cbb' +
          DISTRIBUTOR.slice(2).padStart(64, '0') +
          fund.toString(16).padStart(64, '0')) as Hex,
      },
    ] as never,
  });
  await pub.waitForTransactionReceipt({ hash: fundTx as Hex });
  await test.stopImpersonatingAccount({ address: WHALE });
  ok(
    'pool funded with real NVDA on the fork',
    (await bal(DISTRIBUTOR)) >= fund,
    nvda(await bal(DISTRIBUTOR)),
  );

  // A fresh player wallet with no ETH: gas is sponsored by the relayer.
  const player = privateKeyToAccount(generatePrivateKey()).address;
  const { maxClaim, remaining } = await chain.claimLimits();
  console.log(`      limits: max ${nvda(maxClaim)} per claim, ${nvda(remaining)} left today`);

  const amount = maxClaim / 2n;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const block = await pub.getBlock();
  const voucher = {
    player,
    amount,
    nonce: BigInt('0x' + randomBytes(16).toString('hex')),
    expiry: (block.timestamp > now ? block.timestamp : now) + 600n,
  };
  const sig = await chain.signVoucher(voucher);
  ok('simulated claim passes', (await chain.simulateClaim(voucher, sig)) === null);
  const hash = await chain.submitClaim!(voucher, sig);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  ok('relayer claim mined successfully', receipt.status === 'success', hash);
  ok('player received the NVDA', (await bal(player)) === amount, nvda(await bal(player)));
  ok('player paid no gas', (await pub.getBalance({ address: player })) === 0n);
  ok('voucher nonce is now spent', await chain.nonceUsed(voucher.nonce));
  const after = await chain.claimLimits();
  ok('daily budget went down by the claim', after.remaining === remaining - amount);

  // Replaying the same voucher must fail.
  ok('replayed voucher is rejected', (await chain.simulateClaim(voucher, sig)) !== null);

  // A claim above the per-claim cap must fail, even with a valid signature.
  const big = { ...voucher, amount: maxClaim + 1n, nonce: voucher.nonce + 1n };
  const bigErr = await chain.simulateClaim(big, await chain.signVoucher(big));
  ok('claim above the $25 cap is rejected', bigErr !== null, bigErr ?? '');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

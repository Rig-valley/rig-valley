/**
 * Local end-to-end chain setup for development.
 *
 *   1. In another terminal: anvil --chain-id 46630
 *   2. cd contracts && forge build
 *   3. pnpm --filter @rig-valley/server local-chain [--write-env]
 *
 * Deploys a MockStockToken ("NVDA", test only) and RigValleyDistributor to the
 * local anvil node using anvil's well-known dev accounts, funds the contract,
 * and prints (or writes into ../.env) the matching server settings.
 * NEVER use these keys anywhere but a local anvil node.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  parseUnits,
  type Abi,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const RPC = process.env.LOCAL_RPC_URL ?? 'http://127.0.0.1:8545';

// Anvil's default, publicly known test keys (mnemonic "test test ... junk").
const DEPLOYER = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
const SIGNER = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex;
const RELAYER = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as Hex;

function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const p = join(root, 'contracts/out', `${name}.sol`, `${name}.json`);
  if (!existsSync(p)) throw new Error(`Missing ${p}. Run "forge build" in contracts/ first.`);
  const j = JSON.parse(readFileSync(p, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: j.abi, bytecode: j.bytecode.object };
}

async function main() {
  const probe = createPublicClient({ transport: http(RPC) });
  const chainId = await probe.getChainId().catch(() => {
    throw new Error(`No node at ${RPC}. Start one with: anvil --chain-id 46630`);
  });
  const chain = defineChain({
    id: chainId,
    name: 'Local Anvil',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  });
  const pub = createPublicClient({ chain, transport: http(RPC) });
  const deployer = privateKeyToAccount(DEPLOYER);
  const signer = privateKeyToAccount(SIGNER);
  const relayer = privateKeyToAccount(RELAYER);
  const wallet = createWalletClient({ account: deployer, chain, transport: http(RPC) });

  const token = artifact('MockStockToken');
  const dist = artifact('RigValleyDistributor');

  const tHash = await wallet.deployContract({
    abi: token.abi,
    bytecode: token.bytecode,
    args: ['NVIDIA Stock Token (Test)', 'NVDA', 18, deployer.address],
  });
  const tokenAddr = (await pub.waitForTransactionReceipt({ hash: tHash })).contractAddress!;
  const dHash = await wallet.deployContract({
    abi: dist.abi,
    bytecode: dist.bytecode,
    args: [
      tokenAddr,
      deployer.address,
      signer.address,
      relayer.address,
      86400n,
      parseUnits('500', 18),
      parseUnits('50', 18),
    ],
  });
  const distAddr = (await pub.waitForTransactionReceipt({ hash: dHash })).contractAddress!;
  const mHash = await wallet.writeContract({
    address: tokenAddr,
    abi: token.abi,
    functionName: 'mint',
    args: [distAddr, parseUnits('10000', 18)],
  });
  await pub.waitForTransactionReceipt({ hash: mHash });
  // Make sure the relayer has gas (anvil accounts start with 10,000 ETH, but be explicit).
  const bal = await pub.getBalance({ address: relayer.address });
  if (bal < parseEther('1'))
    await pub.waitForTransactionReceipt({
      hash: await wallet.sendTransaction({ to: relayer.address, value: parseEther('10') }),
    });

  const env: Record<string, string> = {
    CHAIN_ID: String(chainId),
    CHAIN_NAME: 'Local Anvil',
    RPC_URL: RPC,
    PUBLIC_RPC_URL: RPC,
    EXPLORER_URL: 'http://127.0.0.1:8545',
    NVDA_TOKEN_ADDRESS: tokenAddr,
    NVDA_DECIMALS: '18',
    DISTRIBUTOR_ADDRESS: distAddr,
    VOUCHER_SIGNER_KEY: SIGNER,
    RELAYER_PRIVATE_KEY: RELAYER,
  };
  console.log(`MockStockToken (NVDA, test): ${tokenAddr}`);
  console.log(`RigValleyDistributor:        ${distAddr}  (funded with 10,000 test NVDA)`);
  console.log('');
  if (process.argv.includes('--write-env')) {
    const envPath = join(root, '.env');
    let text = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    for (const [k, v] of Object.entries(env)) {
      const re = new RegExp(`^${k}=.*$`, 'm');
      text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text.trimEnd()}\n${k}=${v}\n`;
    }
    writeFileSync(envPath, text);
    console.log(`Updated ${envPath}. Restart the server to enable withdrawals.`);
  } else {
    console.log('Add these to .env (or re-run with --write-env):');
    for (const [k, v] of Object.entries(env)) console.log(`${k}=${v}`);
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});

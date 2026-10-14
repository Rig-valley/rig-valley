/**
 * The player's active wallet: either a browser wallet (MetaMask or any injected
 * EVM wallet, via wagmi) or the on-device wallet created in Rig Valley.
 */
import {
  connect,
  createConfig,
  disconnect,
  getConnectors,
  http,
  injected,
  signMessage as wagmiSignMessage,
  signTypedData as wagmiSignTypedData,
  switchChain,
  waitForTransactionReceipt,
  watchConnectors,
  writeContract,
  type Config,
  type Connector,
} from '@wagmi/core';
import {
  createWalletClient,
  createPublicClient,
  defineChain,
  http as viemHttp,
  type Chain,
  type Hex,
  type TypedDataDefinition,
} from 'viem';
import type { HDAccount } from 'viem/accounts';
import {
  DISTRIBUTOR_ABI,
  type ChainInfoDTO,
  type PublicConfigDTO,
  type WithdrawSubmitResponse,
} from '@rig-valley/shared';

export interface ActiveWallet {
  kind: 'injected' | 'local';
  address: Hex;
  signMessage(message: string): Promise<Hex>;
  signTypedData(td: TypedDataDefinition): Promise<Hex>;
  /** Submit a claim voucher yourself (only when gas sponsorship is off). */
  submitClaim(v: NonNullable<WithdrawSubmitResponse['voucher']>): Promise<Hex>;
}

let chain: Chain | null = null;
let chainInfo: ChainInfoDTO | null = null;
let wagmi: Config | null = null;

export function setupChain(cfg: PublicConfigDTO): void {
  chainInfo = cfg.chain;
  chain = defineChain({
    id: cfg.siwe.chainId,
    name: cfg.chain?.chainName ?? 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [cfg.chain?.rpcUrl ?? 'http://127.0.0.1:8545'] } },
    blockExplorers: cfg.chain
      ? { default: { name: 'Explorer', url: cfg.chain.explorerUrl } }
      : undefined,
  });
  wagmi = createConfig({
    chains: [chain],
    // EIP-6963: every installed wallet (MetaMask, Rainbow, Rabby, …) announces itself and
    // becomes its own connector, so players pick the one they want instead of whichever
    // extension grabbed window.ethereum. The generic injected connector is the fallback
    // for older wallets that don't announce.
    multiInjectedProviderDiscovery: true,
    connectors: [injected()],
    transports: { [chain.id]: http() } as Record<number, ReturnType<typeof http>>,
  });
}

export interface WalletOption {
  uid: string;
  id: string;
  name: string;
  icon?: string;
}

const LAST_WALLET_KEY = 'rv.wallet.connector';

function lastWalletId(): string | null {
  try {
    return localStorage.getItem(LAST_WALLET_KEY);
  } catch {
    return null;
  }
}

function rememberWallet(id: string): void {
  try {
    localStorage.setItem(LAST_WALLET_KEY, id);
  } catch {
    /* storage unavailable */
  }
}

function usableConnectors(): Connector[] {
  if (!wagmi) return [];
  const all = [...getConnectors(wagmi)];
  const announced = all.filter((c) => c.id !== 'injected');
  const generic = all.filter((c) => c.id === 'injected');
  // Only show the generic option when nothing announced itself but window.ethereum exists.
  return announced.length ? announced : hasWindowEthereum() ? generic : [];
}

/** Browser wallets detected on this page, MetaMask first. */
export function listWallets(): WalletOption[] {
  const rank = (c: Connector) => (/metamask/i.test(c.id + c.name) ? 0 : 1);
  return usableConnectors()
    .sort((a, b) => rank(a) - rank(b))
    .map((c) => ({
      uid: c.uid,
      id: c.id,
      name: c.id === 'injected' ? 'Browser wallet' : c.name,
      icon: c.icon,
    }));
}

/** Re-run `cb` whenever a wallet extension announces itself (discovery is asynchronous). */
export function watchWallets(cb: (w: WalletOption[]) => void): () => void {
  if (!wagmi) return () => {};
  return watchConnectors(wagmi, { onChange: () => cb(listWallets()) });
}

function hasWindowEthereum(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { ethereum?: unknown }).ethereum;
}

export function hasInjectedWallet(): boolean {
  return listWallets().length > 0 || hasWindowEthereum();
}

/** The wallet the player used last time, if it's still installed. */
export function lastUsedWallet(): WalletOption | undefined {
  const id = lastWalletId();
  return id ? listWallets().find((w) => w.id === id) : undefined;
}

export function explorerAddressUrl(address: string): string | null {
  return chainInfo ? `${chainInfo.explorerUrl.replace(/\/$/, '')}/address/${address}` : null;
}

/** Connect a specific browser wallet chosen from `listWallets()`. */
export async function connectInjected(uid: string): Promise<ActiveWallet> {
  if (!wagmi || !chain) throw new Error('Wallet setup not ready.');
  const cfg = wagmi;
  const ch = chain;
  const connector = usableConnectors().find((c) => c.uid === uid);
  if (!connector)
    throw new Error(
      'That wallet is no longer available. Pick another one, or create a new wallet.',
    );
  const res = await connect(cfg, { connector }).catch(async (e: Error) => {
    if (/already connected/i.test(e.message)) return { accounts: await connector.getAccounts() };
    throw new Error(
      /rejected|denied/i.test(e.message)
        ? 'You cancelled the wallet request.'
        : `Could not connect ${connector.name}.`,
    );
  });
  const address = res.accounts[0] as Hex;
  rememberWallet(connector.id);
  /**
   * MetaMask only signs EIP-712 data whose domain chainId matches its active network,
   * so switch first (the wallet is asked to add Robinhood Chain if it doesn't know it).
   * Sign-in (SIWE) works on any network and never needs this.
   */
  const ensureChain = async () => {
    if ((await connector.getChainId()) !== ch.id)
      await switchChain(cfg, { chainId: ch.id, connector }).catch(friendly);
  };
  return {
    kind: 'injected',
    address,
    signMessage: (message) =>
      wagmiSignMessage(cfg, { message, account: address, connector }).catch(friendly),
    async signTypedData(td) {
      await ensureChain();
      return wagmiSignTypedData(cfg, {
        ...(td as object),
        account: address,
        connector,
      } as never).catch(friendly);
    },
    async submitClaim(v) {
      await ensureChain();
      const hash = await writeContract(cfg, {
        address: v.distributor as Hex,
        abi: DISTRIBUTOR_ABI,
        functionName: 'claim',
        args: [
          v.player as Hex,
          BigInt(v.amount),
          BigInt(v.nonce),
          BigInt(v.expiry),
          v.signature as Hex,
        ],
        chainId: ch.id,
        connector,
      }).catch(friendly);
      await waitForTransactionReceipt(cfg, { hash, chainId: ch.id });
      return hash;
    },
  };
}

export async function disconnectInjected(): Promise<void> {
  if (wagmi) await disconnect(wagmi).catch(() => {});
}

export function localWallet(account: HDAccount): ActiveWallet {
  return {
    kind: 'local',
    address: account.address,
    signMessage: (message) => account.signMessage({ message }),
    signTypedData: (td) => account.signTypedData(td as never),
    async submitClaim(v) {
      if (!chain) throw new Error('Chain not configured.');
      const client = createWalletClient({ account, chain, transport: viemHttp() });
      const hash = await client.writeContract({
        address: v.distributor as Hex,
        abi: DISTRIBUTOR_ABI,
        functionName: 'claim',
        args: [
          v.player as Hex,
          BigInt(v.amount),
          BigInt(v.nonce),
          BigInt(v.expiry),
          v.signature as Hex,
        ],
      });
      await createPublicClient({ chain, transport: viemHttp() }).waitForTransactionReceipt({
        hash,
      });
      return hash;
    },
  };
}

function friendly(e: Error): never {
  const m = e.message ?? '';
  if (/rejected|denied|cancel/i.test(m)) throw new Error('You cancelled the wallet request.');
  if (/chain|network/i.test(m))
    throw new Error('Please switch your wallet to Robinhood Chain and try again.');
  if (/insufficient funds/i.test(m)) throw new Error('Your wallet needs a little ETH for gas.');
  throw new Error('The wallet request failed. Please try again.');
}

let active: ActiveWallet | null = null;
export function setActiveWallet(w: ActiveWallet | null): void {
  active = w;
}
export function activeWallet(): ActiveWallet | null {
  return active;
}

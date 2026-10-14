/**
 * Robinhood Chain access (MASTERPLAN §2, §10). VERIFY chain id, RPC and
 * explorer against official docs before mainnet. The server holds only:
 *  - the voucher-signing key (cannot move funds by itself), and
 *  - optionally a relayer key that pays gas for `claim` calls only.
 */
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Chain as ViemChain,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import {
  DISTRIBUTOR_ABI,
  DISTRIBUTOR_DOMAIN_NAME,
  DISTRIBUTOR_DOMAIN_VERSION,
  ERC20_ABI,
  VOUCHER_TYPES,
  WITHDRAW_DOMAIN_NAME,
  WITHDRAW_DOMAIN_VERSION,
  WITHDRAW_REQUEST_TYPES,
  type ChainInfoDTO,
} from '@rig-valley/shared';
import { chainEnabled, type Config } from '../config.js';

export interface Voucher {
  player: Address;
  amount: bigint;
  nonce: bigint;
  expiry: bigint;
}

export interface ChainService {
  info: ChainInfoDTO;
  public: PublicClient;
  signVoucher(v: Voucher): Promise<Hex>;
  /** Simulate the claim; returns an error string when it would fail. */
  simulateClaim(v: Voucher, sig: Hex): Promise<string | null>;
  /** Send `claim` from the relayer (gas sponsored). Only available when a relayer key is set. */
  submitClaim?(v: Voucher, sig: Hex): Promise<Hex>;
  receiptStatus(hash: Hex): Promise<'success' | 'reverted' | null>;
  nonceUsed(nonce: bigint): Promise<boolean>;
  contractBalance(): Promise<bigint>;
  contractPaused(): Promise<boolean>;
  verifyWithdrawRequest(args: {
    player: Address;
    destination: Address;
    amount: bigint;
    requestId: bigint;
    deadline: bigint;
    signature: Hex;
  }): Promise<boolean>;
  withdrawDomain(): { name: string; version: string; chainId: number };
  close(): void;
}

export function createChainService(cfg: Config): ChainService | null {
  if (!chainEnabled(cfg)) return null;
  const chain: ViemChain = defineChain({
    id: cfg.CHAIN_ID,
    name: cfg.CHAIN_NAME,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [cfg.RPC_URL!] } },
    blockExplorers: { default: { name: 'Explorer', url: cfg.EXPLORER_URL } },
  });
  const transport = http(cfg.RPC_URL, { timeout: 15_000, retryCount: 2 });
  const publicClient = createPublicClient({ chain, transport }) as PublicClient;
  const signer: PrivateKeyAccount = privateKeyToAccount(cfg.VOUCHER_SIGNER_KEY as Hex);
  const relayerAccount = cfg.RELAYER_PRIVATE_KEY
    ? privateKeyToAccount(cfg.RELAYER_PRIVATE_KEY as Hex)
    : null;
  const relayer: WalletClient | null = relayerAccount
    ? createWalletClient({ account: relayerAccount, chain, transport })
    : null;
  const distributor = cfg.DISTRIBUTOR_ADDRESS as Address;
  const token = cfg.NVDA_TOKEN_ADDRESS as Address;

  const voucherDomain = {
    name: DISTRIBUTOR_DOMAIN_NAME,
    version: DISTRIBUTOR_DOMAIN_VERSION,
    chainId: cfg.CHAIN_ID,
    verifyingContract: distributor,
  } as const;
  const withdrawDomain = {
    name: WITHDRAW_DOMAIN_NAME,
    version: WITHDRAW_DOMAIN_VERSION,
    chainId: cfg.CHAIN_ID,
  };

  const svc: ChainService = {
    info: {
      chainId: cfg.CHAIN_ID,
      chainName: cfg.CHAIN_NAME,
      rpcUrl: cfg.PUBLIC_RPC_URL ?? cfg.RPC_URL!,
      explorerUrl: cfg.EXPLORER_URL,
      distributor,
      token,
      sponsoredGas: !!relayer,
    },
    public: publicClient,
    withdrawDomain: () => withdrawDomain,
    signVoucher: (v) =>
      signer.signTypedData({
        domain: voucherDomain,
        types: VOUCHER_TYPES,
        primaryType: 'Voucher',
        message: v,
      }),
    async simulateClaim(v, sig) {
      try {
        await publicClient.simulateContract({
          address: distributor,
          abi: DISTRIBUTOR_ABI,
          functionName: 'claim',
          args: [v.player, v.amount, v.nonce, v.expiry, sig],
          account: relayerAccount?.address ?? v.player,
        });
        return null;
      } catch (e) {
        return (e as { shortMessage?: string }).shortMessage ?? (e as Error).message;
      }
    },
    receiptStatus: async (hash) => {
      try {
        const r = await publicClient.getTransactionReceipt({ hash });
        return r.status;
      } catch {
        return null;
      }
    },
    nonceUsed: (nonce) =>
      publicClient.readContract({
        address: distributor,
        abi: DISTRIBUTOR_ABI,
        functionName: 'usedNonces',
        args: [nonce],
      }),
    contractBalance: () =>
      publicClient.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [distributor],
      }),
    contractPaused: () =>
      publicClient.readContract({
        address: distributor,
        abi: DISTRIBUTOR_ABI,
        functionName: 'paused',
      }),
    async verifyWithdrawRequest(a) {
      // Supports EOAs and smart-contract wallets (ERC-1271 / ERC-6492) via the public client.
      return publicClient.verifyTypedData({
        address: a.player,
        domain: withdrawDomain,
        types: WITHDRAW_REQUEST_TYPES,
        primaryType: 'WithdrawRequest',
        message: {
          player: a.player,
          destination: a.destination,
          amount: a.amount,
          requestId: a.requestId,
          deadline: a.deadline,
        },
        signature: a.signature,
      });
    },
    close() {},
  };

  if (relayer && relayerAccount) {
    // Gas sponsorship policy: the relayer ONLY ever calls `claim` on the distributor.
    svc.submitClaim = async (v, sig) =>
      relayer.writeContract({
        address: distributor,
        abi: DISTRIBUTOR_ABI,
        functionName: 'claim',
        args: [v.player, v.amount, v.nonce, v.expiry, sig],
        account: relayerAccount,
        chain,
      });
  }
  return svc;
}

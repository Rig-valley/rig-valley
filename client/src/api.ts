/** Thin client for the game server API. All errors surface as friendly English messages. */
import type {
  ActionResponse,
  CreateFarmRequest,
  GameAction,
  MarketDTO,
  MeDTO,
  PublicConfigDTO,
  RewardsDTO,
  StateDTO,
  WithdrawPrepareDTO,
  WithdrawSubmitResponse,
  WithdrawalDTO,
} from '@rig-valley/shared';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('offline', "Can't reach the Rig Valley server. Check your connection.", 0);
  }
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const e = (json ?? {}) as { error?: string; message?: string };
    throw new ApiError(e.error ?? 'error', e.message ?? 'Something went wrong.', res.status);
  }
  return json as T;
}

export const api = {
  publicConfig: () => request<PublicConfigDTO>('GET', '/config/public'),
  nonce: () =>
    request<{ nonce: string; domain: string; uri: string; chainId: number }>('GET', '/auth/nonce'),
  verify: (message: string, signature: string) =>
    request<MeDTO>('POST', '/auth/verify', { message, signature }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout', {}),
  me: () => request<MeDTO | null>('GET', '/me'),
  nameAvailable: (name: string) =>
    request<{ available: boolean }>('GET', `/farm/name-available?name=${encodeURIComponent(name)}`),
  createFarm: (req: CreateFarmRequest) => request<StateDTO>('POST', '/farm', req),
  state: () => request<StateDTO>('GET', '/state'),
  tick: (paused: boolean) => request<ActionResponse>('POST', '/tick', { paused }),
  act: (action: GameAction) => request<ActionResponse>('POST', '/action', action),
  market: () => request<MarketDTO>('GET', '/market'),
  rewards: () => request<RewardsDTO>('GET', '/rewards'),
  withdrawPrepare: () => request<WithdrawPrepareDTO>('POST', '/rewards/withdraw/prepare', {}),
  withdrawSubmit: (withdrawalId: number, signature: string) =>
    request<WithdrawSubmitResponse>('POST', '/rewards/withdraw', { withdrawalId, signature }),
  withdrawalTx: (id: number, txHash: string) =>
    request<WithdrawalDTO>('POST', `/rewards/withdrawals/${id}/tx`, { txHash }),
  withdrawal: (id: number) => request<WithdrawalDTO>('GET', `/rewards/withdrawals/${id}`),
};

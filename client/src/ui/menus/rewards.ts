/**
 * Rewards & Withdraw (MASTERPLAN §9): locked → unlocked (neon) → sign →
 * pending tx → success with explorer link, plus withdrawal history.
 */
import {
  formatDuration,
  formatTokenUnits,
  formatUsd,
  shortAddress,
  type RewardsDTO,
  type WithdrawalDTO,
} from '@rig-valley/shared';
import { api, ApiError } from '../../api';
import { store } from '../../store';
import { sfx } from '../../audio';
import { ensureWallet } from '../../wallet/session';
import { ICONS, add, clear, h, icon, termsLink } from '../dom';
import { openModal, showModal, type ModalHandle } from '../modal';

const STATUS_TEXT: Record<WithdrawalDTO['status'], string> = {
  awaiting_signature: 'Waiting for your signature',
  signed: 'Sending…',
  submitted: 'On its way',
  voucher_issued: 'Waiting for your transaction',
  confirmed: 'Sent',
  failed: 'Retrying',
  refunded: 'Returned to your rewards',
  cancelled: 'Cancelled',
};

export async function openRewards(): Promise<void> {
  const body = h('div', { class: 'col', style: 'gap:14px' }, h('p', { class: 'dim' }, 'Loading…'));
  const m = showModal('Rewards', body, { wide: true, key: 'rewards' });
  await renderRewards(body, m);
}

async function renderRewards(body: HTMLElement, m: ModalHandle): Promise<void> {
  let data: RewardsDTO;
  try {
    data = await api.rewards();
  } catch (e) {
    clear(body);
    body.append(
      h('p', { class: 'bad' }, e instanceof ApiError ? e.message : "Couldn't load your rewards."),
    );
    return;
  }
  clear(body);
  const s = data.summary;
  const pct = s.minUsd > 0 ? Math.min(1, s.pendingUsd / s.minUsd) : 1;
  const segs = 20;
  const more = Math.max(0, s.minUsd - s.pendingUsd);
  const amount = formatTokenUnits(s.pendingUnits, s.decimals, 6);
  const now = Date.now();
  const waitMs = s.withdrawOpensAt !== null ? s.withdrawOpensAt - now : 0;
  const tooNew = waitMs > 0;

  const withdrawBtn = h(
    'button',
    {
      class: `btn big ${s.unlocked ? 'neon' : ''}`,
      type: 'button',
      disabled: !s.unlocked || s.paused || !data.chain || tooNew,
    },
    'Withdraw',
  );
  withdrawBtn.addEventListener('click', () => {
    m.close();
    void startWithdraw();
  });

  const status = !data.chain
    ? h(
        'p',
        { class: 'warn' },
        "Withdrawals aren't switched on yet. Your rewards are safe and keep piling up.",
      )
    : s.paused
      ? h('p', { class: 'warn' }, 'Withdrawals are paused for maintenance. Your rewards are safe.')
      : s.unlocked && tooNew
        ? h(
            'p',
            { class: 'warn' },
            `Unlocked! New farms can withdraw after a few days — yours opens in ${formatDuration(waitMs)}.`,
          )
        : s.unlocked
          ? h('p', { class: 'good' }, 'Unlocked! Send your rewards to your wallet anytime.')
          : h(
              'p',
              null,
              s.priceUsd ? `${formatUsd(more)} more to unlock.` : 'Waiting for a price update…',
            );

  body.append(
    h(
      'div',
      { class: 'row', style: 'gap:24px;align-items:flex-start' },
      h(
        'div',
        { class: 'col grow', style: 'gap:6px' },
        h('span', { class: 'label' }, 'Your rewards (NVIDIA Stock Token)'),
        h(
          'div',
          { class: 'row', style: 'gap:10px' },
          icon(ICONS.nvda, 32),
          h('b', { class: 'big-number num' }, `${amount} ${s.symbol}`),
        ),
        s.priceUsd
          ? h(
              'div',
              { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
              h('span', { class: 'money num' }, `≈ ${formatUsd(s.pendingUsd)}`),
              h('span', { class: 'dim' }, `(1 ${s.symbol} ≈ ${formatUsd(s.priceUsd)})`),
            )
          : h('span', { class: 'dim' }, 'USD estimate unavailable right now'),
        s.backlogUsd > 0
          ? h(
              'span',
              { class: 'dim', style: 'font-size:15px' },
              `${formatUsd(s.backlogUsd)} from recent harvests will be added once the price updates.`,
            )
          : null,
      ),
      h(
        'div',
        { class: 'col', style: 'gap:8px;align-items:flex-end' },
        withdrawBtn,
        h(
          'span',
          { class: 'dim', style: 'font-size:15px' },
          data.chain?.sponsoredGas
            ? 'No gas fees — we cover them.'
            : data.chain
              ? 'You pay a small gas fee in ETH.'
              : '',
        ),
        h(
          'span',
          { class: 'dim', style: 'font-size:13px;text-align:right;max-width:240px' },
          'Withdrawing confirms you are eligible under the ',
          termsLink('Terms'),
          '.',
        ),
      ),
    ),
    h(
      'div',
      { class: 'col', style: 'gap:6px' },
      h(
        'div',
        {
          class: `progress-track${s.unlocked ? ' unlocked' : ''}`,
          role: 'progressbar',
          'aria-valuenow': Math.round(pct * 100),
          'aria-valuemin': 0,
          'aria-valuemax': 100,
        },
        ...Array.from({ length: segs }, (_, i) =>
          h('i', { class: i < Math.round(pct * segs) ? 'on' : '' }),
        ),
      ),
      h(
        'div',
        { class: 'spread' },
        status,
        h(
          'span',
          { class: 'money num' },
          `${formatUsd(Math.min(s.pendingUsd, s.minUsd))} of ${formatUsd(s.minUsd)}`,
        ),
      ),
    ),
    h(
      'div',
      { class: 'panel', style: 'padding:10px 14px' },
      h(
        'p',
        null,
        `Every harvest pays ${formatUsd(s.usdPerHarvest)} in ${s.symbol}.`,
        s.boostLeft > 0
          ? h(
              'span',
              { class: 'good' },
              ` Beginner boost: ${s.boostLeft} boosted harvest${s.boostLeft === 1 ? '' : 's'} left!`,
            )
          : null,
      ),
      s.nvdaHarvestsPerDay > 0
        ? h(
            'p',
            {
              class: s.nvdaHarvestsToday >= s.nvdaHarvestsPerDay ? 'warn' : 'dim',
              style: 'font-size:15px',
            },
            s.nvdaHarvestsToday >= s.nvdaHarvestsPerDay
              ? `Today's limit reached: ${s.nvdaHarvestsPerDay} of ${s.nvdaHarvestsPerDay} harvests paid ${s.symbol}. More harvests still pay Coins; ${s.symbol} is back in ${formatDuration(s.nvdaLimitResetsAt - now)} (midnight UTC).`
              : `Today: ${s.nvdaHarvestsToday} of ${s.nvdaHarvestsPerDay} harvests paid ${s.symbol}. The count resets in ${formatDuration(s.nvdaLimitResetsAt - now)} (midnight UTC).`,
          )
        : null,
      tooNew && !s.unlocked
        ? h(
            'p',
            { class: 'dim', style: 'font-size:15px' },
            `New farms can withdraw after a few days. Yours opens in ${formatDuration(waitMs)}.`,
          )
        : null,
      h(
        'p',
        { class: 'dim', style: 'font-size:15px' },
        'Coins stay in the game. Only harvests earn NVDA. Better rigs simply harvest more often.',
      ),
    ),
  );

  if (data.withdrawals.length) {
    body.append(h('h3', { class: 'label' }, 'Withdrawals'));
    for (const w of data.withdrawals) body.append(withdrawalRow(w, s.decimals, s.symbol));
  }
  if (data.harvests.length) {
    body.append(h('h3', { class: 'label' }, 'Recent harvests'));
    body.append(
      h(
        'div',
        { style: 'display:grid;grid-template-columns:repeat(2,1fr);gap:4px' },
        ...data.harvests.slice(0, 10).map((hv) =>
          h(
            'div',
            { class: 'list-item', style: 'padding:5px 9px;font-size:16px' },
            h(
              'span',
              { class: 'grow dim' },
              new Date(hv.ts).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              }),
            ),
            hv.usd === 0 && hv.nvdaUnits === '0'
              ? h('span', { class: 'dim' }, 'Coins only (daily limit)')
              : h(
                  'span',
                  { class: 'num' },
                  `+${formatTokenUnits(hv.nvdaUnits, s.decimals, 6)} ${s.symbol}`,
                ),
            hv.boosted ? h('span', { class: 'good' }, '★') : null,
          ),
        ),
      ),
    );
  }
}

function withdrawalRow(w: WithdrawalDTO, decimals: number, symbol: string): HTMLElement {
  const color =
    w.status === 'confirmed'
      ? 'var(--green)'
      : w.status === 'refunded' || w.status === 'cancelled'
        ? 'var(--metal-3)'
        : 'var(--yellow)';
  return h(
    'div',
    { class: 'list-item' },
    icon(ICONS.wallet, 24),
    h(
      'div',
      { class: 'grow col', style: 'gap:0' },
      h(
        'b',
        null,
        `${formatTokenUnits(w.amountUnits, decimals, 6)} ${symbol} · ${formatUsd(w.usdAtRequest)}`,
      ),
      h(
        'span',
        { class: 'dim', style: 'font-size:15px' },
        `${new Date(w.createdAt).toLocaleString('en-US')} → ${shortAddress(w.destination)}`,
      ),
    ),
    h('span', { style: { color } }, STATUS_TEXT[w.status]),
    w.explorerUrl
      ? h('a', { href: w.explorerUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Explorer')
      : null,
  );
}

async function startWithdraw(): Promise<void> {
  const body = h(
    'div',
    { class: 'col', style: 'gap:12px' },
    h('p', null, 'Preparing your withdrawal…'),
  );
  const panel = h('div', { class: 'panel modal narrow' }, h('h2', null, 'Withdraw'), body);
  const m = openModal(panel, { closable: false });
  const closeBtn = () => {
    const b = h('button', { class: 'btn', type: 'button' }, 'Close');
    b.addEventListener('click', () => m.close());
    return b;
  };
  try {
    const wallet = await ensureWallet();
    if (!wallet) throw new Error('cancel');
    const prep = await api.withdrawPrepare();
    const symbol = store.state?.rewards.symbol ?? 'NVDA';
    const decimals = store.state?.rewards.decimals ?? 18;
    clear(body);
    const confirm = h('button', { class: 'btn neon', type: 'button' }, 'Sign & withdraw');
    const cancel = h('button', { class: 'btn', type: 'button' }, 'Cancel');
    body.append(
      h(
        'dl',
        { class: 'kv' },
        h('dt', null, 'Amount'),
        h(
          'dd',
          null,
          h('b', null, `${formatTokenUnits(prep.amountUnits, decimals, 6)} ${symbol}`),
          h('span', { class: 'dim' }, ` ≈ ${formatUsd(prep.usd)}`),
        ),
        h('dt', null, 'To your wallet'),
        h('dd', { style: 'word-break:break-all' }, prep.typedData.message.destination),
      ),
      h(
        'p',
        { class: 'dim', style: 'font-size:15px' },
        'Your wallet will ask you to sign. Signing is free and proves the request came from you.',
      ),
      h('div', { class: 'row', style: 'justify-content:flex-end' }, cancel, confirm),
    );
    await new Promise<void>((resolve, reject) => {
      cancel.addEventListener('click', () => reject(new Error('cancel')));
      confirm.addEventListener('click', () => resolve());
    });
    clear(body);
    body.append(h('p', null, 'Check your wallet to sign…'));
    const td = prep.typedData;
    const signature = await wallet.signTypedData({
      domain: td.domain,
      types: td.types as never,
      primaryType: td.primaryType,
      message: {
        ...td.message,
        amount: BigInt(td.message.amount),
        requestId: BigInt(td.message.requestId),
        deadline: BigInt(td.message.deadline),
      },
    } as never);
    clear(body);
    body.append(h('p', null, 'Sending your rewards…'));
    const res = await api.withdrawSubmit(prep.withdrawalId, signature);
    let w = res.withdrawal;
    if (res.voucher) {
      clear(body);
      body.append(
        h(
          'p',
          null,
          'Confirm the claim transaction in your wallet. You pay a small gas fee in ETH.',
        ),
      );
      const hash = await wallet.submitClaim(res.voucher);
      w = await api.withdrawalTx(w.id, hash);
    }
    // Poll until confirmed (or give up and let it finish in the background).
    clear(body);
    const line = h('p', null, 'Pending transaction…');
    body.append(line);
    for (let i = 0; i < 40 && w.status !== 'confirmed'; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      w = await api.withdrawal(w.id);
      line.textContent = `${STATUS_TEXT[w.status]}…`;
    }
    clear(body);
    if (w.status === 'confirmed') {
      sfx('harvest');
      add(
        body,
        h('p', { class: 'good', style: 'font-size:20px' }, 'Success! Your NVDA is in your wallet.'),
        w.explorerUrl
          ? h(
              'a',
              { href: w.explorerUrl, target: '_blank', rel: 'noopener noreferrer' },
              'View on the explorer',
            )
          : null,
      );
    } else {
      body.append(
        h(
          'p',
          null,
          "It's taking a little longer than usual. You can close this — the status updates in Rewards.",
        ),
      );
    }
    body.append(h('div', { class: 'row', style: 'justify-content:flex-end' }, closeBtn()));
    void store.tick();
  } catch (e) {
    if ((e as Error).message === 'cancel') {
      m.close();
      return;
    }
    clear(body);
    body.append(
      h('p', { class: 'bad' }, (e as Error).message || 'Something went wrong.'),
      h('div', { class: 'row', style: 'justify-content:flex-end' }, closeBtn()),
    );
  }
}

/**
 * Onboarding (MASTERPLAN §5): title → account → (create / import / connect)
 * → farm name → character → Uncle Ray's letter → tutorial.
 */
import {
  HAIR_COLORS,
  STARTER_HATS,
  HATS,
  shortAddress,
  validateCharacterName,
  validateFarmName,
  type HairColorId,
  type HatId,
  type MeDTO,
  type StateDTO,
} from '@rig-valley/shared';
import { api, ApiError } from '../api';
import { sfx, unlockAudio } from '../audio';
import {
  accountFromPhrase,
  encryptPhrase,
  isValidPhrase,
  loadKeystore,
  newRecoveryPhrase,
  normalizePhrase,
  saveKeystore,
  deleteKeystore,
} from '../wallet/keystore';
import { askPassword, setSessionAddress } from '../wallet/session';
import { signIn } from '../wallet/siwe';
import {
  connectInjected,
  hasInjectedWallet,
  localWallet,
  setActiveWallet,
  type ActiveWallet,
} from '../wallet/wallet';
import { clear, h, termsLink } from './dom';
import { confirmModal, uiRoot } from './modal';
import { pickWallet } from './walletPicker';
import { letterView } from './menus/journal';

let screen: HTMLElement | null = null;

function show(el: HTMLElement): void {
  screen?.remove();
  screen = el;
  uiRoot().appendChild(el);
  queueMicrotask(() => el.querySelector<HTMLElement>('[autofocus], input, button')?.focus());
}

export function hideScreen(): void {
  screen?.remove();
  screen = null;
}

function card(title: string, ...children: (HTMLElement | string | null)[]): HTMLElement {
  return h(
    'div',
    { class: 'screen' },
    h(
      'div',
      { class: 'panel modal', style: 'width:620px' },
      h('h2', { style: 'font-size:28px' }, title),
      ...children,
    ),
  );
}

function busy(btn: HTMLButtonElement, label: string): () => void {
  const prev = btn.textContent;
  btn.setAttribute('disabled', '');
  btn.textContent = label;
  return () => {
    btn.removeAttribute('disabled');
    btn.textContent = prev;
  };
}

// ------------------------------------------------------------------ title
export interface IntroHost {
  playIntro(signal: { skipped: boolean }): Promise<void>;
}

const BOOT_LINES: [string, string][] = [
  ['RIG VALLEY OS v0.1', ''],
  ['Waking up the garage', 'OK'],
  ['Checking fans', 'OK'],
  ['Shooing cats off the rigs', 'MOSTLY'],
  ['Warming up the neon', 'OK'],
];

/**
 * Opening intro (first visit per session): a CRT power-on with boot lines, then the
 * camera drifts from town to the garage while the neon and rigs flicker on, and the
 * logo lights up. Any key or click skips it. Resolves when the player presses Start.
 */
export function titleScreen(world: IntroHost): Promise<void> {
  return new Promise((resolve) => {
    let seen = false;
    try {
      seen = sessionStorage.getItem('rv.introSeen') === '1';
      sessionStorage.setItem('rv.introSeen', '1');
    } catch {
      /* storage unavailable */
    }
    const signal = { skipped: false };
    const start = h('button', { class: 'btn primary big rise delay-2', type: 'button' }, 'Start');
    const title = h(
      'div',
      { class: 'screen title-wrap' },
      h('h1', { class: 'logo flicker' }, 'RIG ', h('span', { class: 'v' }, 'VALLEY')),
      h('p', { class: 'tagline rise delay-1' }, 'Grow rigs. Harvest rewards. Pet no cats.'),
      h('div', { class: 'grow' }),
      start,
      h(
        'p',
        {
          class: 'dim rise delay-3',
          style: 'font-size:15px;text-shadow:2px 2px 0 #0b0a1a;margin-bottom:6vh',
        },
        'Press Enter to start · Best on a desktop browser · v0.1',
      ),
    );
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      window.removeEventListener('keydown', onKey);
      unlockAudio();
      sfx('power_on');
      resolve();
    };
    start.addEventListener('click', go);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && document.body.contains(start)) go();
    };

    const showTitle = () => {
      show(title);
      window.addEventListener('keydown', onKey);
      queueMicrotask(() => start.focus());
    };

    if (seen) {
      showTitle();
      return;
    }

    // --- intro ---
    const lines = h('div', { class: 'boot-lines', 'aria-live': 'polite' });
    const intro = h(
      'div',
      { class: 'intro' },
      h('div', { class: 'crt-line' }),
      lines,
      h('div', { class: 'scanlines' }),
      h('div', { class: 'skip-hint' }, 'Press any key to skip'),
    );
    show(intro);
    const skip = () => {
      if (signal.skipped) return;
      signal.skipped = true;
      unlockAudio();
    };
    const onSkip = () => skip();
    window.addEventListener('keydown', onSkip, { once: true });
    intro.addEventListener('pointerdown', onSkip, { once: true });

    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    void (async () => {
      await wait(560);
      for (const [text, ok] of BOOT_LINES) {
        if (signal.skipped) break;
        const line = h('div', null, `> ${text}`);
        lines.append(line);
        await wait(240);
        if (ok) line.append(' … ', h('span', { class: 'ok' }, ok));
        await wait(120);
      }
      if (!signal.skipped) await wait(300);
      intro.classList.add('fade');
      const pan = world.playIntro(signal);
      await wait(signal.skipped ? 0 : 700);
      intro.remove();
      // Logo appears while the camera arrives at the garage.
      if (!signal.skipped) await Promise.race([pan, wait(3600)]);
      window.removeEventListener('keydown', onSkip);
      showTitle();
      await pan;
    })();
  });
}

// ------------------------------------------------------------------ account
/** Returns the signed-in MeDTO once the player has a wallet + SIWE session. */
export async function accountScreen(): Promise<MeDTO> {
  const rec = await loadKeystore();
  return new Promise((resolve) => {
    const err = h('div', { class: 'error-text', role: 'alert' });
    const done = (me: MeDTO, wallet: ActiveWallet) => {
      setActiveWallet(wallet);
      setSessionAddress(me.address);
      resolve(me);
    };
    const signInWith = async (wallet: ActiveWallet, btn: HTMLButtonElement) => {
      const restore = busy(btn, 'Check your wallet…');
      try {
        const me = await signIn(wallet);
        done(me, wallet);
      } catch (e) {
        restore();
        err.textContent =
          e instanceof ApiError || e instanceof Error ? e.message : 'Sign-in failed.';
      }
    };

    const connect = h('button', { class: 'btn primary big', type: 'button' }, 'Connect Wallet');
    connect.addEventListener('click', async () => {
      err.textContent = '';
      try {
        const choice = await pickWallet();
        if (!choice) return;
        const w = await connectInjected(choice.uid);
        await signInWith(w, connect);
      } catch (e) {
        err.textContent = (e as Error).message;
      }
    });
    const create = h('button', { class: 'btn neon big', type: 'button' }, 'Create New Wallet');
    create.addEventListener('click', async () => {
      if (rec) {
        const ok = await confirmModal(
          'Replace the saved wallet?',
          'This device already has a farm wallet. Creating a new one replaces it here.\nMake sure you have its 12 recovery words written down first.',
          'Continue',
          'Cancel',
        );
        if (!ok) return;
      }
      const res = await createWalletFlow();
      if (res) {
        const me = await signIn(res).catch((e: Error) => {
          err.textContent = e.message;
          return null;
        });
        if (me) done(me, res);
        else show(main);
      } else show(main);
    });
    const importLink = h(
      'button',
      { class: 'btn small', type: 'button' },
      'I have recovery words (Import Wallet)',
    );
    importLink.addEventListener('click', async () => {
      const res = await importWalletFlow();
      if (res) {
        const me = await signIn(res).catch((e: Error) => {
          err.textContent = e.message;
          return null;
        });
        if (me) done(me, res);
        else show(main);
      } else show(main);
    });

    let unlock: HTMLElement | null = null;
    if (rec) {
      const b = h(
        'button',
        { class: 'btn gold big', type: 'button' },
        `Unlock ${shortAddress(rec.address)}`,
      );
      b.addEventListener('click', async () => {
        const phrase = await askPassword(
          'Unlock your wallet',
          'Enter the password for the wallet saved on this device.',
        );
        if (!phrase) return;
        await signInWith(localWallet(accountFromPhrase(phrase)), b);
      });
      unlock = h(
        'div',
        { class: 'col', style: 'gap:6px' },
        h('span', { class: 'dim' }, 'Welcome back! Your farm wallet is saved on this device.'),
        b,
      );
    }

    const main = card(
      'Your account',
      unlock,
      h(
        'p',
        { class: 'dim' },
        'Your farm lives in a crypto wallet. You hold the keys — we never see them. Signing in is free.',
      ),
      h(
        'div',
        { class: 'col', style: 'gap:10px' },
        connect,
        h(
          'span',
          { class: 'dim', style: 'font-size:15px' },
          hasInjectedWallet()
            ? 'Use MetaMask or any browser wallet.'
            : 'No browser wallet detected. Create a new wallet instead.',
        ),
        create,
        h(
          'span',
          { class: 'dim', style: 'font-size:15px' },
          'New to crypto? We make one for you, right here on your device.',
        ),
      ),
      h('div', { class: 'row' }, importLink),
      err,
      h(
        'p',
        { class: 'dim', style: 'font-size:14px;margin:0' },
        'By continuing you confirm you are 18+ and eligible to receive rewards, and you agree to the ',
        termsLink(),
        '.',
      ),
    );
    show(main);
  });
}

async function createWalletFlow(): Promise<ActiveWallet | null> {
  const words = newRecoveryPhrase();
  // Step 1: show the words
  const ok1 = await new Promise<boolean>((resolve) => {
    const back = h('button', { class: 'btn', type: 'button' }, 'Back');
    const next = h('button', { class: 'btn primary', type: 'button' }, 'I wrote them down');
    const el = card(
      'Your recovery words',
      h(
        'p',
        null,
        'These 12 words are your wallet. Recovery words are a backup of your account: anyone who has them owns your farm and rewards.',
      ),
      h(
        'p',
        { class: 'warn' },
        'Write these words down. If you lose them, nobody (not even us) can get your farm back.',
      ),
      h(
        'div',
        { class: 'words-grid' },
        ...words.map((w, i) => h('div', { class: 'word' }, h('b', null, `${i + 1}.`), w)),
      ),
      h(
        'p',
        { class: 'dim', style: 'font-size:15px' },
        'Paper is best. No screenshots, no chat apps.',
      ),
      h('div', { class: 'row', style: 'justify-content:space-between' }, back, next),
    );
    back.addEventListener('click', () => resolve(false));
    next.addEventListener('click', () => resolve(true));
    show(el);
  });
  if (!ok1) return null;

  // Step 2: confirm several words
  const picks = pickIndexes(3);
  const ok2 = await new Promise<boolean>((resolve) => {
    const inputs = picks.map((i) =>
      h('input', {
        class: 'input',
        autocomplete: 'off',
        spellcheck: false,
        'aria-label': `Word number ${i + 1}`,
      }),
    );
    const err = h('div', { class: 'error-text', role: 'alert' });
    const back = h('button', { class: 'btn', type: 'button' }, 'Show words again');
    const next = h('button', { class: 'btn primary', type: 'submit' }, 'Confirm');
    const form = h(
      'form',
      { class: 'col' },
      ...picks.map((i, k) =>
        h('div', { class: 'field' }, h('label', null, `Word #${i + 1}`), inputs[k]!),
      ),
      err,
      h('div', { class: 'row', style: 'justify-content:space-between' }, back, next),
    );
    const el = card(
      "Let's double-check",
      h('p', null, 'Type these words from your list to make sure you saved them.'),
      form,
    );
    back.addEventListener('click', () => resolve(false));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const wrong = picks.some((i, k) => inputs[k]!.value.trim().toLowerCase() !== words[i]);
      if (wrong) {
        err.textContent = "That doesn't match. Check your list and try again.";
        sfx('error');
        return;
      }
      resolve(true);
    });
    show(el);
  });
  if (!ok2) return createWalletFlowRetry(words);

  return passwordAndSave(words.join(' '));
}

/** Going back from confirm shows the same words again (never a new set mid-flow). */
async function createWalletFlowRetry(words: string[]): Promise<ActiveWallet | null> {
  const ok = await new Promise<boolean>((resolve) => {
    const next = h('button', { class: 'btn primary', type: 'button' }, 'I wrote them down');
    const cancel = h('button', { class: 'btn', type: 'button' }, 'Cancel');
    show(
      card(
        'Your recovery words',
        h(
          'div',
          { class: 'words-grid' },
          ...words.map((w, i) => h('div', { class: 'word' }, h('b', null, `${i + 1}.`), w)),
        ),
        h('div', { class: 'row', style: 'justify-content:space-between' }, cancel, next),
      ),
    );
    next.addEventListener('click', () => resolve(true));
    cancel.addEventListener('click', () => resolve(false));
  });
  if (!ok) return null;
  return passwordAndSave(words.join(' '));
}

function pickIndexes(n: number): number[] {
  const idx = Array.from({ length: 12 }, (_, i) => i);
  const rnd = crypto.getRandomValues(new Uint32Array(12));
  for (let i = idx.length - 1; i > 0; i--) {
    const j = rnd[i]! % (i + 1);
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return idx.slice(0, n).sort((a, b) => a - b);
}

async function passwordAndSave(phrase: string): Promise<ActiveWallet | null> {
  return new Promise((resolve) => {
    const pw = h('input', {
      class: 'input',
      type: 'password',
      autocomplete: 'new-password',
      'aria-label': 'Password',
    });
    const pw2 = h('input', {
      class: 'input',
      type: 'password',
      autocomplete: 'new-password',
      'aria-label': 'Repeat password',
    });
    const err = h('div', { class: 'error-text', role: 'alert' });
    const next = h('button', { class: 'btn primary', type: 'submit' }, 'Save wallet');
    const cancel = h('button', { class: 'btn', type: 'button' }, 'Cancel');
    const form = h(
      'form',
      { class: 'col' },
      h('div', { class: 'field' }, h('label', null, 'Password (at least 8 characters)'), pw),
      h('div', { class: 'field' }, h('label', null, 'Repeat password'), pw2),
      err,
      h('div', { class: 'row', style: 'justify-content:space-between' }, cancel, next),
    );
    show(
      card(
        'Lock it with a password',
        h(
          'p',
          null,
          'Your wallet is saved on this device, encrypted with this password. You need it each time you sign in here.',
        ),
        form,
      ),
    );
    cancel.addEventListener('click', () => resolve(null));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (pw.value.length < 8) return void (err.textContent = 'Use at least 8 characters.');
      if (pw.value !== pw2.value) return void (err.textContent = "The passwords don't match.");
      const restore = busy(next, 'Encrypting…');
      try {
        const rec = await encryptPhrase(phrase, pw.value);
        await deleteKeystore().catch(() => {});
        await saveKeystore(rec);
        sfx('quest');
        resolve(localWallet(accountFromPhrase(phrase)));
      } catch {
        restore();
        err.textContent = "Couldn't save the wallet on this device. Is private browsing on?";
      }
    });
  });
}

async function importWalletFlow(): Promise<ActiveWallet | null> {
  const phrase = await new Promise<string | null>((resolve) => {
    const ta = h('textarea', {
      class: 'input',
      rows: 3,
      spellcheck: false,
      autocomplete: 'off',
      'aria-label': 'Recovery words',
      style: 'resize:none',
    });
    const err = h('div', { class: 'error-text', role: 'alert' });
    const next = h('button', { class: 'btn primary', type: 'submit' }, 'Continue');
    const cancel = h('button', { class: 'btn', type: 'button' }, 'Back');
    const form = h(
      'form',
      { class: 'col' },
      h(
        'div',
        { class: 'field' },
        h('label', null, 'Your 12 recovery words, separated by spaces'),
        ta,
      ),
      err,
      h('div', { class: 'row', style: 'justify-content:space-between' }, cancel, next),
    );
    show(
      card(
        'Import Wallet',
        h('p', null, 'Restore your farm on this device with your 12 recovery words.'),
        form,
      ),
    );
    cancel.addEventListener('click', () => resolve(null));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!isValidPhrase(ta.value)) {
        err.textContent = "Those words don't form a valid wallet. Check the spelling and order.";
        sfx('error');
        return;
      }
      resolve(normalizePhrase(ta.value));
    });
  });
  if (!phrase) return null;
  return passwordAndSave(phrase);
}

// ------------------------------------------------------------------ farm setup
export function farmSetupScreen(): Promise<StateDTO> {
  return new Promise((resolve) => {
    let hair: HairColorId = 'copper';
    let hat: HatId = 'cap';
    const farmName = h('input', {
      class: 'input',
      maxlength: 24,
      autocomplete: 'off',
      placeholder: "e.g. Ray's Garage",
      'aria-label': 'Farm name',
    });
    const nameHint = h('div', { class: 'error-text', role: 'status' });
    const charName = h('input', {
      class: 'input',
      maxlength: 16,
      autocomplete: 'off',
      placeholder: 'Your name',
      'aria-label': 'Character name',
    });
    const err = h('div', { class: 'error-text', role: 'alert' });
    const preview = h('canvas', {
      class: 'preview-canvas',
      width: 16,
      height: 24,
      'aria-label': 'Character preview',
    });
    const hairRow = h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' });
    const hatRow = h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' });
    const create = h('button', { class: 'btn primary big', type: 'submit' }, 'Start farming');

    const draw = async () => {
      const ctx = preview.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 16, 24);
      const layers = ['player_body', `hair_${hair}`, hat !== 'none' ? `hat_${hat}` : null].filter(
        Boolean,
      ) as string[];
      for (const l of layers) {
        const img = await loadImg(`/assets/${l}.png`);
        ctx.drawImage(img, 0, 0, 16, 24, 0, 0, 16, 24);
      }
    };
    for (const c of HAIR_COLORS) {
      const b = h('button', {
        class: 'swatch',
        type: 'button',
        style: { background: c.color },
        'aria-label': `${c.name} hair`,
        'aria-pressed': String(c.id === hair),
      });
      b.addEventListener('click', () => {
        hair = c.id;
        [...hairRow.children].forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        void draw();
      });
      hairRow.append(b);
    }
    for (const id of STARTER_HATS) {
      const b = h(
        'button',
        { class: 'btn small', type: 'button', 'aria-pressed': String(id === hat) },
        HATS.find((x) => x.id === id)!.name,
      );
      if (id === hat) b.style.borderColor = 'var(--cyan)';
      b.addEventListener('click', () => {
        hat = id;
        [...hatRow.children].forEach(
          (x) => ((x as HTMLElement).style.borderColor = x === b ? 'var(--cyan)' : ''),
        );
        void draw();
      });
      hatRow.append(b);
    }
    let timer = 0;
    farmName.addEventListener('input', () => {
      window.clearTimeout(timer);
      const v = farmName.value;
      const local = validateFarmName(v);
      if (local) {
        nameHint.textContent = v.trim() ? local : '';
        nameHint.style.color = '';
        return;
      }
      timer = window.setTimeout(async () => {
        const r = await api.nameAvailable(v).catch(() => ({ available: true }));
        nameHint.textContent = r.available
          ? 'Nice name! It’s yours forever.'
          : 'That name is taken.';
        nameHint.style.color = r.available ? 'var(--green)' : '';
      }, 350);
    });

    const form = h(
      'form',
      { class: 'panel modal wide', style: 'gap:16px' },
      h('h2', { style: 'font-size:28px' }, 'Your farm'),
      h(
        'div',
        { class: 'row', style: 'align-items:flex-start;gap:24px' },
        h(
          'div',
          { class: 'col grow', style: 'gap:14px' },
          h(
            'div',
            { class: 'field' },
            h('label', null, 'Farm name (permanent — one farm per wallet)'),
            farmName,
            nameHint,
          ),
          h('div', { class: 'field' }, h('label', null, 'Farmer name'), charName),
          h('div', { class: 'field' }, h('label', null, 'Hair color'), hairRow),
          h('div', { class: 'field' }, h('label', null, 'Hat'), hatRow),
        ),
        h(
          'div',
          { class: 'col', style: 'align-items:center' },
          preview,
          h('span', { class: 'dim' }, 'Preview'),
        ),
      ),
      err,
      h('div', { class: 'row', style: 'justify-content:flex-end' }, create),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fe = validateFarmName(farmName.value) ?? validateCharacterName(charName.value);
      if (fe) {
        err.textContent = fe;
        sfx('error');
        return;
      }
      const restore = busy(create, 'Building your garage…');
      try {
        const state = await api.createFarm({
          farmName: farmName.value.trim(),
          character: { name: charName.value.trim(), hair, hat },
        });
        sfx('levelup');
        resolve(state);
      } catch (e2) {
        restore();
        err.textContent = e2 instanceof ApiError ? e2.message : 'Something went wrong.';
      }
    });
    show(h('div', { class: 'screen' }, form));
    void draw();
  });
}

const imgCache = new Map<string, Promise<HTMLImageElement>>();
function loadImg(src: string): Promise<HTMLImageElement> {
  if (!imgCache.has(src)) {
    imgCache.set(
      src,
      new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = src;
      }),
    );
  }
  return imgCache.get(src)!;
}

// ------------------------------------------------------------------ story opener
export function storyOpener(state: StateDTO): Promise<void> {
  return new Promise((resolve) => {
    const letter = state.mail.find((m) => m.templateId === 'ray_welcome');
    const go = h('button', { class: 'btn primary big', type: 'button' }, "Let's go");
    const el = h(
      'div',
      { class: 'screen' },
      h(
        'div',
        { style: 'width:640px' },
        letter ? letterView(letter) : h('p', null, 'Welcome to Rig Valley!'),
      ),
      go,
    );
    go.addEventListener('click', () => resolve());
    show(el);
  });
}

export function messageScreen(
  title: string,
  text: string,
  action?: { label: string; fn: () => void },
): void {
  const btn = action ? h('button', { class: 'btn primary', type: 'button' }, action.label) : null;
  btn?.addEventListener('click', action!.fn);
  show(card(title, h('p', null, text), btn));
}

export { clear };

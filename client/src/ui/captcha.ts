/**
 * Cloudflare Turnstile "I am human" check, shown when creating a farm if the server asks
 * for it (PublicConfigDTO.captchaSiteKey). Wallets are free, so this is what keeps scripts
 * from creating farms in bulk.
 */
import { h } from './dom';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface Turnstile {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string;
      theme?: 'light' | 'dark' | 'auto';
      callback?: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    },
  ): string;
  reset(id?: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing'));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('turnstile failed to load'));
    };
    document.head.append(script);
  });
  return loading;
}

export interface CaptchaWidget {
  el: HTMLElement;
  /** The current token, or null when the check isn't done (or expired). */
  token(): string | null;
  /** Tokens work once: get a fresh one after every attempt. */
  reset(): void;
}

export function captchaWidget(siteKey: string): CaptchaWidget {
  let token: string | null = null;
  let id: string | null = null;
  let api: Turnstile | null = null;
  const box = h('div', { class: 'captcha-box' });
  const note = h('div', { class: 'dim', style: 'font-size:15px', role: 'status' });
  const el = h('div', { class: 'field' }, h('label', null, 'Quick check'), box, note);

  loadTurnstile()
    .then((t) => {
      api = t;
      id = t.render(box, {
        sitekey: siteKey,
        theme: 'dark',
        callback: (v) => {
          token = v;
          note.textContent = '';
        },
        'expired-callback': () => {
          token = null;
          note.textContent = 'The check expired. Tick it again.';
        },
        'error-callback': () => {
          token = null;
          note.textContent = "The check couldn't finish. It will retry — or reload the page.";
        },
      });
    })
    .catch(() => {
      note.textContent =
        "Couldn't load the human check. Check your connection (or turn off blockers for this site) and reload.";
    });

  return {
    el,
    token: () => token,
    reset: () => {
      token = null;
      if (api && id !== null) api.reset(id);
    },
  };
}

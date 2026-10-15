/**
 * Cloudflare Turnstile check for farm creation: one wallet = one farm, and wallets are free,
 * so the captcha is what makes creating farms in bulk slow and costly for scripts.
 * Off unless TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are both set.
 */
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type CaptchaResult = 'ok' | 'invalid' | 'unavailable';

export async function verifyTurnstile(
  secret: string,
  token: string | undefined,
  ip: string,
): Promise<CaptchaResult> {
  if (!token) return 'invalid';
  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return 'unavailable';
    const body = (await res.json()) as { success?: boolean };
    return body.success === true ? 'ok' : 'invalid';
  } catch {
    return 'unavailable';
  }
}

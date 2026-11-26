import type { Cookies } from '@sveltejs/kit';

// A record save ends in a redirect, so the saved note cannot ride the
// form result back the way a same page save does. It travels in a
// one-shot cookie instead - the landing page reads it, shows the
// pop-up and clears the cookie, so a refresh never shows it twice.
const FLASH_COOKIE = 'jcar_flash';

const MESSAGES: Record<string, string> = {
  fuel: 'Fuel-Up saved successfully',
  service: 'Service saved successfully',
  expense: 'Expense saved successfully',
  note: 'Note saved successfully',
  reminder: 'Reminder saved successfully',
  reminders: 'Reminders saved successfully'
};

// The only detail a pop-up ever carries is the fuel economy line, and
// the server builds it at save time. This pattern is the whole shape
// it is allowed to take, checked on the way in and on the way out.
const DETAIL_RE = /^Last (MPG|L\/100km): \d+\.\d$/;

export interface Flash {
  message: string;
  detail: string | null;
}

export function setFlash(cookies: Cookies, kind: string, detail?: string | null): void {
  const value = detail && DETAIL_RE.test(detail) ? `${kind}|${detail}` : kind;
  cookies.set(FLASH_COOKIE, value, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 });
}

export function takeFlash(cookies: Cookies): Flash | null {
  const raw = cookies.get(FLASH_COOKIE);
  if (!raw) return null;
  cookies.delete(FLASH_COOKIE, { path: '/' });
  const [kind, detail] = raw.split('|');
  const message = MESSAGES[kind];
  if (!message) return null;
  return { message, detail: detail && DETAIL_RE.test(detail) ? detail : null };
}

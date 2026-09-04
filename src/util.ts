// shared utils: md5, pbkdf2, cookies, settings
export function hex(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export function randToken(bytes = 24): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return hex(a);
}
export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(salt), iterations: 100000 }, key, 256);
  return hex(bits);
}
export function hexToBytes(h: string): Uint8Array {
  const a = new Uint8Array(h.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16);
  return a;
}
export async function makePassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randToken(16);
  return { salt, hash: await hashPassword(password, salt) };
}


export { md5 } from './md5';

// ---- cookies / sessions ----
export function getCookie(request: Request, name: string): string | null {
  const c = request.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? m[1] : null;
}
export function sessionCookie(name: string, token: string, days = 30): string {
  const exp = new Date(Date.now() + days * 86400e3).toUTCString();
  return `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${exp}; Max-Age=${days * 86400}`;
}
export function clearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; Secure; Max-Age=0`;
}

export type Row = Record<string, any>;
export async function getSettings(env: { DB: D1Database }): Promise<Record<string, string>> {
  const { results } = await env.DB.prepare('SELECT k, v FROM settings').all<Row>();
  const out: Record<string, string> = {};
  for (const r of results) out[r.k] = r.v;
  return out;
}
export async function setSetting(env: { DB: D1Database }, k: string, v: string): Promise<void> {
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(k, v).run();
}

export async function currentUser(env: { DB: D1Database }, request: Request): Promise<Row | null> {
  const token = getCookie(request, 'wb_session');
  if (!token) return null;
  return await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first<Row>();
}
export async function extendMembership(env: { DB: D1Database }, userId: number, days: number): Promise<string> {
  const row = await env.DB.prepare('SELECT membership_expires_at FROM users WHERE id=?').bind(userId).first<Row>();
  const cur = row?.membership_expires_at ? new Date(row.membership_expires_at.replace(' ', 'T') + 'Z') : null;
  const base = cur && cur > new Date() ? cur : new Date();
  base.setUTCDate(base.getUTCDate() + days);
  const iso = base.toISOString().slice(0, 19).replace('T', ' ');
  await env.DB.prepare('UPDATE users SET membership_expires_at=? WHERE id=?').bind(iso, userId).run();
  return iso;
}
export function jsonErr(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } });
}

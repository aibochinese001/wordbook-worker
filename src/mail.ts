// SMTP sender over Workers TCP sockets + simple SMTP client
export async function sendMail(cfg: { host: string; port: number; user: string; pass: string; from?: string }, to: string, subject: string, body: string): Promise<void> {
  // tolerate "host:port" in host, and display-name in from ("Name <a@b.c>")
  let host = cfg.host.trim();
  let port = cfg.port;
  const hp = host.match(/^([^:]+):(\d+)$/);
  if (hp) { host = hp[1]; port = Number(hp[2]); }
  const fromRaw = (cfg.from || cfg.user).trim();
  const fm = fromRaw.match(/<([^>]+)>/);
  const from = fm ? fm[1] : fromRaw;
  const { connect } = await import('cloudflare:sockets');
  const secure = port === 465;
  let socket = connect({ hostname: host, port }, { secureTransport: secure ? 'on' : 'starttls' }) as any;
  let writer = socket.writable.getWriter();
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buf = '';
  const reader = socket.readable.getReader();

  let closed = false;
  function readChunk(timeoutMs = 8000): Promise<string> {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(''), timeoutMs); // per-chunk timeout: keep waiting in caller loop
      reader.read().then(({ value, done }) => {
        clearTimeout(t);
        if (done) { closed = true; resolve(''); }
        else resolve(dec.decode(value));
      }).catch(() => { clearTimeout(t); closed = true; resolve(''); });
    });
  }
  async function readUntil(expect: string, timeoutMs = 8000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (!buf.includes(expect)) {
      if (Date.now() > deadline) throw new Error('SMTP timeout waiting for ' + expect + ' got: ' + buf.slice(-200));
      if (closed) throw new Error('SMTP connection closed by server while waiting for ' + expect + '; got: ' + buf.slice(-200));
      const chunk = await readChunk(Math.min(3000, deadline - Date.now() + 500));
      buf += chunk;
    }
    const out = buf;
    buf = '';
    return out;
  }

  async function cmd(line: string, expect = '250'): Promise<string> {
    await writer.write(enc.encode(line + '\r\n'));
    return await readUntil(expect);
  }

  let step = 'connect';
  try {
  await readUntil('220'); step='EHLO'; // greeting
  await cmd('EHLO wordbook', '250');
  if (!secure) {
    await cmd('STARTTLS', '220');
    // re-handshake: after starttls we must restart the TLS session
    socket = await socket.startTls();
    writer = socket.writable.getWriter();
    const r2 = socket.readable.getReader();
    // replace reader via closure trick: re-create readUntil over new reader
    buf = '';
    await writer.write(enc.encode('EHLO wordbook\r\n'));
    // simple read
    const t = await r2.read();
    void t;
  }
    step='AUTH LOGIN';
  await cmd('AUTH LOGIN', '334');
    step='AUTH user';
  await cmd(b64(cfg.user), '334');
    step='AUTH pass';
  await cmd(b64(cfg.pass), '235');
    step='MAIL FROM';
  await cmd(`MAIL FROM:<${cfg.user}>`, '250');  // QQ等要求 MAIL FROM 必须等于认证账号
    step='RCPT TO';
  await cmd(`RCPT TO:<${to}>`, '250');
    step='DATA';
  await cmd('DATA', '354');
  const msg = [
    `From: ${cfg.user}`,
    `To: <${to}>`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    body,
    '.',
  ].join('\r\n');
  await writer.write(enc.encode(msg + '\r\n'));
    step='DATA body';
  await readUntil('250', 30000); // server rejection (5xx) surfaces in error message via closed-by-server path
    step='QUIT';
  try { await cmd('QUIT', '221'); } catch {} // QUIT response best-effort
    } catch (e: any) {
    throw new Error('[' + step + '] ' + (e.message || e));
  }
  try { writer.close(); reader.close(); } catch {}
}

function b64(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

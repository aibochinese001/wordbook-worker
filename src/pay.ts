// 易支付 (yipay) gateway — all channels (usdt/wechat/alipay/stripe) route through it
import { md5 } from './util';

export function yipaySign(params: Record<string, string>, key: string): string {
  const ks = Object.keys(params).filter((k) => k !== 'sign' && k !== 'sign_type' && params[k] !== '' && params[k] != null).sort();
  const qs = ks.map((k) => `${k}=${params[k]}`).join('&');
  return md5(qs + key);
}

// build yipay submit URL (GET jump, CF-friendly)
export function yipayUrl(cfg: { apiurl: string; pid: string; key: string; channel: string },
  orderNo: string, name: string, moneyUsd: number, notifyUrl: string, returnUrl: string, siteUrl: string): string {
  const p: Record<string, string> = {
    pid: cfg.pid,
    type: cfg.channel, // alipay | wxpay | usdt | stripe — gateway-dependent type name
    out_trade_no: orderNo,
    notify_url: notifyUrl,
    return_url: returnUrl,
    name,
    money: moneyUsd.toFixed(2),
    sitename: 'WordBook',
  };
  const sign = yipaySign(p, cfg.key);
  const qs = new URLSearchParams({ ...p, sign, sign_type: 'MD5' }).toString();
  return `${cfg.apiurl.replace(/\/$/, '')}/submit.php?${qs}`;
}

export function verifyYipayNotify(params: Record<string, string>, key: string): boolean {
  const sign = params.sign;
  if (!sign) return false;
  return yipaySign(params, key) === sign.toLowerCase();
}

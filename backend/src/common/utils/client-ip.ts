import { BlockList, isIP } from 'node:net';
import type { Request, Response, NextFunction } from 'express';

/**
 * Real client IP behind Cloudflare → IIS/ARR → Node.
 *
 * Express's `trust proxy` alone isn't enough there: ARR records the Cloudflare
 * edge as the client (with a `:port` suffix that proxy-addr can't parse), so
 * every visitor would share a handful of edge IPs for rate limits, lockouts and
 * the sessions list. Cloudflare sends the visitor's address in
 * `CF-Connecting-IP`; we use it, but only when the request provably came
 * through Cloudflare:
 *   - the TCP peer is loopback (IIS on this host forwarded it), and
 *   - the hop IIS saw (last X-Forwarded-For entry) is a Cloudflare range.
 * A direct hit on the origin IP can set any headers it likes, but its last
 * XFF hop is its own address, not Cloudflare's, so it is never trusted.
 *
 * Enabled with TRUST_CLOUDFLARE=true (prod). Ranges: cloudflare.com/ips —
 * they change rarely; update this list if Cloudflare announces new ones.
 */
const CLOUDFLARE_RANGES = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

const cloudflare = new BlockList();
for (const cidr of CLOUDFLARE_RANGES) {
  const [net, prefix] = cidr.split('/');
  cloudflare.addSubnet(net, Number(prefix), isIP(net) === 6 ? 'ipv6' : 'ipv4');
}

/** "1.2.3.4:5678", "[::1]:80", "::ffff:1.2.3.4" → bare IP, or null. */
export function normalizeIp(raw: string | undefined): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracketed) ip = bracketed[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.split(':')[0];
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  return isIP(ip) ? ip : null;
}

export function isCloudflareIp(ip: string | null): boolean {
  if (!ip) return false;
  return cloudflare.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');
}

function isLoopback(ip: string | null): boolean {
  return ip === '127.0.0.1' || ip === '::1' || !!ip?.startsWith('127.');
}

/** Visitor IP if the request came Cloudflare → IIS → us, else null. */
export function cloudflareClientIp(req: Request): string | null {
  if (!isLoopback(normalizeIp(req.socket?.remoteAddress))) return null;
  const xff = req.headers['x-forwarded-for'];
  const hops = (Array.isArray(xff) ? xff.join(',') : xff || '').split(',');
  const edge = normalizeIp(hops[hops.length - 1]);
  if (!isCloudflareIp(edge)) return null;
  const cf = req.headers['cf-connecting-ip'];
  return normalizeIp(Array.isArray(cf) ? cf[0] : cf);
}

/** Express middleware: makes req.ip / req.ips the Cloudflare visitor IP. */
export function cloudflareClientIpMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const ip = cloudflareClientIp(req);
  if (ip) {
    Object.defineProperty(req, 'ip', { value: ip, configurable: true });
    Object.defineProperty(req, 'ips', { value: [ip], configurable: true });
  }
  next();
}

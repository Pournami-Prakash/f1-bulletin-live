import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const ARTICLE_HOSTS = new Set([
  'feeds.bbci.co.uk', 'www.fia.com', 'fia.com', 'www.bbc.com', 'www.bbc.co.uk', 'bbc.com', 'bbc.co.uk',
  'www.motorsport.com', 'motorsport.com', 'www.racefans.net', 'racefans.net',
  'www.reddit.com', 'reddit.com', 'www.formula1.com', 'formula1.com',
]);
const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32]] as const) blocked.addSubnet(network, prefix, 'ipv6');

export function isPublicAddress(address: string) {
  const version = isIP(address);
  if (version === 6 && address.toLowerCase().startsWith('::ffff:')) return false;
  return version !== 0 && !blocked.check(address, version === 4 ? 'ipv4' : 'ipv6');
}
export function isArticleUrl(url: URL) {
  return url.protocol === 'https:' && !url.username && !url.password
    && (!url.port || url.port === '443') && ARTICLE_HOSTS.has(url.hostname);
}
export async function assertArticleUrl(url: URL) {
  if (!isArticleUrl(url)) throw new Error('Article destination is not allowed');
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('Article destination is not public');
}

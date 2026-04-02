import { SourceName } from '../providers/types.js';

const SOURCE_HEADERS: Record<SourceName, Record<string, string>> = {
  kuwo: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'http://www.kuwo.cn/',
    Cookie: 'kw_token=ABCDEFG',
  },
  netease: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://music.163.com/',
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  qq: {
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B143 Safari/601.1',
    Referer: 'http://y.qq.com',
    'Content-Type': 'application/json',
  },
  kugou: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://www.kugou.com/',
  },
};

export async function sourceGet(
  source: SourceName,
  url: string,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const headers = { ...SOURCE_HEADERS[source], ...extraHeaders };
  return fetch(url, { headers });
}

export async function sourcePost(
  source: SourceName,
  url: string,
  body: string | Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const headers = { ...SOURCE_HEADERS[source], ...extraHeaders };
  return fetch(url, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

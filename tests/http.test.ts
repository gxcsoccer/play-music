import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sourceGet, sourcePost } from '../src/utils/http.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('sourceGet', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(new Response('ok'));
  });

  it('sends request with kuwo headers', async () => {
    await sourceGet('kuwo', 'https://example.com/api');
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/api', {
      headers: expect.objectContaining({
        Referer: 'http://www.kuwo.cn/',
      }),
    });
  });

  it('sends request with qq headers', async () => {
    await sourceGet('qq', 'https://example.com/api');
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/api', {
      headers: expect.objectContaining({
        Referer: 'http://y.qq.com',
      }),
    });
  });

  it('merges extra headers', async () => {
    await sourceGet('kuwo', 'https://example.com', { 'X-Custom': 'val' });
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['X-Custom']).toBe('val');
  });
});

describe('sourcePost', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(new Response('ok'));
  });

  it('sends POST with string body', async () => {
    await sourcePost('netease', 'https://example.com', 'params=value');
    expect(mockFetch).toHaveBeenCalledWith('https://example.com', {
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
      body: 'params=value',
    });
  });

  it('sends POST with object body as JSON', async () => {
    await sourcePost('qq', 'https://example.com', { key: 'value' });
    const body = mockFetch.mock.calls[0][1].body;
    expect(JSON.parse(body)).toEqual({ key: 'value' });
  });
});

import { createCipheriv, createHash, publicEncrypt, randomBytes } from 'node:crypto';
import { MusicProvider, Song } from './types.js';
import { sourcePost } from '../utils/http.js';

const LINUX_API = 'http://music.163.com/api/linux/forward';
const WEAPI_URL = 'http://music.163.com/weapi/song/enhance/player/url';
const LYRIC_URL = 'https://music.163.com/weapi/song/lyric';

// WeAPI constants
const WEAPI_NONCE = '0CoJUm6Qyw8W8jud';
const WEAPI_IV = '0102030405060708';
const WEAPI_PUBKEY = '010001';
const WEAPI_MODULUS =
  '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';

// Linux API key
const LINUX_KEY = Buffer.from('7246674226682325323F5E6544673A51', 'hex');

function pkcs7Pad(data: Buffer, blockSize = 16): Buffer {
  const padding = blockSize - (data.length % blockSize);
  return Buffer.concat([data, Buffer.alloc(padding, padding)]);
}

function aesEcbEncrypt(data: string, key: Buffer): string {
  const cipher = createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(false);
  const padded = pkcs7Pad(Buffer.from(data));
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  return encrypted.toString('hex').toUpperCase();
}

function aesCbcEncrypt(data: string, key: string, iv: string): string {
  const cipher = createCipheriv(
    'aes-128-cbc',
    Buffer.from(key),
    Buffer.from(iv),
  );
  const encrypted = Buffer.concat([
    cipher.update(data, 'utf-8'),
    cipher.final(),
  ]);
  return encrypted.toString('base64');
}

function randomString(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from(randomBytes(len))
    .map(b => chars[b % chars.length])
    .join('');
}

function rsaEncrypt(text: string, pubKey: string, modulus: string): string {
  // Reverse the text
  const reversed = text.split('').reverse().join('');
  // Convert to hex
  const hex = Buffer.from(reversed).toString('hex');
  // Modular exponentiation: hex^pubKey mod modulus
  const base = BigInt('0x' + hex);
  const exp = BigInt('0x' + pubKey);
  const mod = BigInt('0x' + modulus);
  const result = modPow(base, exp, mod);
  return result.toString(16).padStart(256, '0');
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod;
    }
    exp = exp >> 1n;
    base = (base * base) % mod;
  }
  return result;
}

function encryptLinux(data: object): string {
  const json = JSON.stringify(data);
  return aesEcbEncrypt(json, LINUX_KEY);
}

function encryptWeApi(data: object): { params: string; encSecKey: string } {
  const text = JSON.stringify(data);
  const secKey = randomString(16);
  const enc1 = aesCbcEncrypt(text, WEAPI_NONCE, WEAPI_IV);
  const enc2 = aesCbcEncrypt(enc1, secKey, WEAPI_IV);
  const encSecKey = rsaEncrypt(secKey, WEAPI_PUBKEY, WEAPI_MODULUS);
  return { params: enc2, encSecKey };
}

// Response types
interface NeteaseSearchSong {
  id: number;
  name: string;
  ar: Array<{ name: string }>;
  al: { name: string; picUrl?: string };
  dt: number;
}

interface NeteaseSearchResponse {
  result?: {
    songs?: NeteaseSearchSong[];
  };
}

interface NeteaseUrlResponse {
  data?: Array<{
    url: string | null;
    code: number;
    br: number;
  }>;
}

interface NeteaseLyricResponse {
  code: number;
  lrc?: { lyric: string };
}

export const neteaseProvider: MusicProvider = {
  name: 'netease',

  async search(keyword: string, limit = 20): Promise<Song[]> {
    const payload = {
      method: 'POST',
      url: 'http://music.163.com/api/cloudsearch/pc',
      params: { s: keyword, type: 1, offset: 0, limit },
    };
    const encrypted = encryptLinux(payload);
    const body = `eparams=${encrypted}`;

    const res = await sourcePost('netease', LINUX_API, body);
    const json = (await res.json()) as NeteaseSearchResponse;
    const songs = json.result?.songs ?? [];

    return songs.map(s => ({
      id: String(s.id),
      source: 'netease' as const,
      name: s.name,
      artist: s.ar.map(a => a.name).join('/'),
      album: s.al.name,
      duration: Math.floor(s.dt / 1000),
      cover: s.al.picUrl,
    }));
  },

  async getSongUrl(song: Song): Promise<string> {
    const data = { ids: `[${song.id}]`, br: 320000 };
    const encrypted = encryptWeApi(data);
    const body = `params=${encodeURIComponent(encrypted.params)}&encSecKey=${encodeURIComponent(encrypted.encSecKey)}`;

    const res = await sourcePost('netease', WEAPI_URL, body);
    const json = (await res.json()) as NeteaseUrlResponse;

    const item = json.data?.[0];
    if (item?.url) return item.url;

    throw new Error('Netease: failed to get download URL (copyright restricted)');
  },

  async getLyrics(song: Song): Promise<string> {
    const data = { csrf_token: '', id: song.id, lv: -1, tv: -1 };
    const encrypted = encryptWeApi(data);
    const body = `params=${encodeURIComponent(encrypted.params)}&encSecKey=${encodeURIComponent(encrypted.encSecKey)}`;

    const res = await sourcePost('netease', LYRIC_URL, body);
    const json = (await res.json()) as NeteaseLyricResponse;

    return json.lrc?.lyric ?? '';
  },
};

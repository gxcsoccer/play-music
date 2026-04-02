import { createHash } from 'node:crypto';
import { MusicProvider, Song } from './types.js';
import { sourceGet } from '../utils/http.js';

const SEARCH_URL = 'http://songsearch.kugou.com/song_search_v2';
const SONG_INFO_URL = 'http://m.kugou.com/app/i/getSongInfo.php';
const TRACKER_URL = 'https://trackercdn.kugou.com/i/v2/';
const LYRIC_SEARCH_URL = 'http://krcs.kugou.com/search';
const LYRIC_DOWNLOAD_URL = 'http://lyrics.kugou.com/download';

function md5(str: string): string {
  return createHash('md5').update(str).digest('hex');
}

interface KugouSearchItem {
  Scid: number;
  SongName: string;
  SingerName: string;
  AlbumName: string;
  AlbumID: string;
  Audioid: number;
  Duration: number;
  FileHash: string;
  HQFileHash: string;
  SQFileHash: string;
  Image: string;
}

interface KugouSearchResponse {
  data?: {
    lists?: KugouSearchItem[];
  };
}

interface KugouSongInfoResponse {
  url?: string;
  error?: string;
  errcode?: number;
}

interface KugouTrackerResponse {
  url?: string[];
}

interface KugouLyricSearchResponse {
  status: number;
  candidates?: Array<{
    id: number;
    accesskey: string;
  }>;
}

interface KugouLyricDownloadResponse {
  status: number;
  content?: string;
}

export const kugouProvider: MusicProvider = {
  name: 'kugou',

  async search(keyword: string, limit = 20): Promise<Song[]> {
    const params = new URLSearchParams({
      keyword,
      platform: 'WebFilter',
      format: 'json',
      page: '1',
      pagesize: String(limit),
    });
    const res = await sourceGet('kugou', `${SEARCH_URL}?${params}`);
    const json = (await res.json()) as KugouSearchResponse;
    const lists = json.data?.lists ?? [];

    return lists.map(item => ({
      id: String(item.Audioid || item.Scid),
      source: 'kugou' as const,
      name: item.SongName.replace(/<\/?em>/g, ''),
      artist: item.SingerName,
      album: item.AlbumName,
      duration: item.Duration,
      cover: item.Image?.replace('{size}', '480') || undefined,
      extra: {
        fileHash: item.FileHash,
        hqFileHash: item.HQFileHash,
        sqFileHash: item.SQFileHash,
      },
    }));
  },

  async getSongUrl(song: Song): Promise<string> {
    const hash =
      (song.extra?.hqFileHash as string) ||
      (song.extra?.fileHash as string);
    if (!hash) throw new Error('KuGou: no file hash available');

    // Method 1: Basic API
    try {
      const params = new URLSearchParams({ cmd: 'playInfo', hash });
      const res = await sourceGet('kugou', `${SONG_INFO_URL}?${params}`);
      const json = (await res.json()) as KugouSongInfoResponse;
      if (json.url && !json.error) return json.url;
    } catch {
      // fallback
    }

    // Method 2: Tracker CDN
    const key = md5(hash + 'kgcloudv2');
    const params = new URLSearchParams({
      cdnBackup: '1',
      behavior: 'download',
      pid: '1',
      cmd: '21',
      appid: '1001',
      hash,
      key,
    });
    const res = await sourceGet('kugou', `${TRACKER_URL}?${params}`);
    const json = (await res.json()) as KugouTrackerResponse;
    if (json.url?.[0]) return json.url[0];

    throw new Error('KuGou: failed to get download URL');
  },

  async getLyrics(song: Song): Promise<string> {
    const hash =
      (song.extra?.fileHash as string) || '';
    if (!hash) return '';

    // Step 1: search lyrics
    const searchParams = new URLSearchParams({
      ver: '1',
      client: 'mobi',
      duration: '',
      hash,
      album_audio_id: '',
    });
    const searchRes = await sourceGet('kugou', `${LYRIC_SEARCH_URL}?${searchParams}`);
    const searchJson = (await searchRes.json()) as KugouLyricSearchResponse;

    if (!searchJson.candidates?.length) return '';
    const { id, accesskey } = searchJson.candidates[0];

    // Step 2: download lyrics
    const dlParams = new URLSearchParams({
      ver: '1',
      client: 'pc',
      id: String(id),
      accesskey,
      fmt: 'lrc',
      charset: 'utf8',
    });
    const dlRes = await sourceGet('kugou', `${LYRIC_DOWNLOAD_URL}?${dlParams}`);
    const dlJson = (await dlRes.json()) as KugouLyricDownloadResponse;

    if (!dlJson.content) return '';
    return Buffer.from(dlJson.content, 'base64').toString('utf-8');
  },
};

export interface LyricLine {
  time: number; // seconds
  text: string;
}

const LRC_TIME_RE = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

export function parseLRC(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split('\n')) {
    const matches = [...raw.matchAll(LRC_TIME_RE)];
    if (matches.length === 0) continue;
    const text = raw.replace(LRC_TIME_RE, '').trim();
    if (!text) continue;
    for (const m of matches) {
      const minutes = parseInt(m[1], 10);
      const seconds = parseInt(m[2], 10);
      const ms = parseInt(m[3].padEnd(3, '0'), 10);
      lines.push({ time: minutes * 60 + seconds + ms / 1000, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

export function getCurrentLine(lines: LyricLine[], position: number): number {
  if (lines.length === 0) return -1;
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= position) idx = i;
    else break;
  }
  return idx;
}

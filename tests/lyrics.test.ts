import { describe, it, expect } from 'vitest';
import { parseLRC, getCurrentLine, LyricLine } from '../src/player/lyrics.js';

describe('parseLRC', () => {
  it('parses standard LRC format', () => {
    const lrc = `[00:01.00]First line
[00:05.50]Second line
[00:10.00]Third line`;
    const result = parseLRC(lrc);
    expect(result).toEqual([
      { time: 1, text: 'First line' },
      { time: 5.5, text: 'Second line' },
      { time: 10, text: 'Third line' },
    ]);
  });

  it('parses 3-digit milliseconds', () => {
    const lrc = '[00:01.500]Hello';
    const result = parseLRC(lrc);
    expect(result).toEqual([{ time: 1.5, text: 'Hello' }]);
  });

  it('parses 2-digit milliseconds', () => {
    const lrc = '[00:01.50]Hello';
    const result = parseLRC(lrc);
    expect(result).toEqual([{ time: 1.5, text: 'Hello' }]);
  });

  it('handles multiple timestamps per line', () => {
    const lrc = '[00:01.00][00:10.00]Repeated line';
    const result = parseLRC(lrc);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ time: 1, text: 'Repeated line' });
    expect(result[1]).toEqual({ time: 10, text: 'Repeated line' });
  });

  it('skips empty text lines', () => {
    const lrc = `[00:01.00]Hello
[00:05.00]
[00:10.00]World`;
    const result = parseLRC(lrc);
    expect(result).toHaveLength(2);
  });

  it('skips non-LRC lines', () => {
    const lrc = `[ti:Song Title]
[ar:Artist]
[00:01.00]Lyrics start`;
    const result = parseLRC(lrc);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Lyrics start');
  });

  it('returns sorted by time', () => {
    const lrc = `[00:10.00]Later
[00:01.00]Earlier`;
    const result = parseLRC(lrc);
    expect(result[0].time).toBe(1);
    expect(result[1].time).toBe(10);
  });

  it('handles empty input', () => {
    expect(parseLRC('')).toEqual([]);
  });
});

describe('getCurrentLine', () => {
  const lyrics: LyricLine[] = [
    { time: 0, text: 'Intro' },
    { time: 5, text: 'Line 1' },
    { time: 10, text: 'Line 2' },
    { time: 20, text: 'Line 3' },
  ];

  it('returns -1 for empty lyrics', () => {
    expect(getCurrentLine([], 5)).toBe(-1);
  });

  it('returns first line for position 0', () => {
    expect(getCurrentLine(lyrics, 0)).toBe(0);
  });

  it('returns correct line for mid-position', () => {
    expect(getCurrentLine(lyrics, 7)).toBe(1);
    expect(getCurrentLine(lyrics, 10)).toBe(2);
    expect(getCurrentLine(lyrics, 15)).toBe(2);
    expect(getCurrentLine(lyrics, 25)).toBe(3);
  });

  it('returns last line for position past end', () => {
    expect(getCurrentLine(lyrics, 100)).toBe(3);
  });

  it('returns 0 for position before first timestamp', () => {
    const lines: LyricLine[] = [
      { time: 5, text: 'First' },
      { time: 10, text: 'Second' },
    ];
    expect(getCurrentLine(lines, 2)).toBe(0);
  });
});

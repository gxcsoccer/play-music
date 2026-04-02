import { describe, it, expect } from 'vitest';
import { formatDuration, sanitizeFilename, truncate } from '../src/utils/format.js';

describe('formatDuration', () => {
  it('formats 0 seconds', () => {
    expect(formatDuration(0)).toBe('00:00');
  });

  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('00:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(269)).toBe('04:29');
  });

  it('formats large durations', () => {
    expect(formatDuration(3661)).toBe('61:01');
  });

  it('handles NaN gracefully', () => {
    expect(formatDuration(NaN)).toBe('00:00');
  });

  it('handles negative values', () => {
    expect(formatDuration(-10)).toBe('00:00');
  });
});

describe('sanitizeFilename', () => {
  it('replaces slashes with underscore', () => {
    expect(sanitizeFilename('a/b\\c')).toBe('a_b_c');
  });

  it('replaces special characters with underscore', () => {
    expect(sanitizeFilename('song<name>:test')).toBe('song_name__test');
  });

  it('preserves valid characters', () => {
    expect(sanitizeFilename('周杰伦 - 晴天.mp3')).toBe('周杰伦 - 晴天.mp3');
  });

  it('handles empty string', () => {
    expect(sanitizeFilename('')).toBe('');
  });
});

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates long strings with ellipsis', () => {
    expect(truncate('hello world foo', 10)).toBe('hello wor…');
  });

  it('handles exact length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });
});

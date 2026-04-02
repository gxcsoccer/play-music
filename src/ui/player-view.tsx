import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { Song } from '../providers/types.js';
import { getProvider } from '../providers/registry.js';
import { spawnMpv, connectMpv, isMpvRunning, MpvIPC } from '../player/mpv.js';
import { writeState, cleanupSocket, ensureStateDir, MPV_SOCKET } from '../player/daemon.js';
import { parseLRC, getCurrentLine, LyricLine } from '../player/lyrics.js';
import { formatDuration } from '../utils/format.js';

interface PlayerViewProps {
  song: Song;
  allSongs: Song[];
}

export function PlayerView({ song, allSongs }: PlayerViewProps) {
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const mpvRef = useRef<MpvIPC | null>(null);

  // Start playback
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        ensureStateDir();
        const provider = getProvider(song.source);
        if (!provider) throw new Error(`Provider ${song.source} not found`);

        const url = await provider.getSongUrl(song);

        // Stop existing mpv
        if (isMpvRunning()) {
          try {
            const old = await connectMpv();
            await old.command(['quit']);
            old.disconnect();
          } catch {}
          cleanupSocket();
        }

        spawnMpv(url, MPV_SOCKET);

        writeState({
          song,
          playlist: allSongs,
          currentIndex: allSongs.indexOf(song),
          volume,
        });

        // Wait for mpv socket
        for (let i = 0; i < 30; i++) {
          if (cancelled) return;
          if (isMpvRunning()) break;
          await new Promise(r => setTimeout(r, 100));
        }

        if (cancelled) return;
        const mpv = await connectMpv();
        mpvRef.current = mpv;
        setPlaying(true);
        setLoading(false);

        // Fetch lyrics
        provider.getLyrics(song).then(lrc => {
          if (!cancelled && lrc) setLyrics(parseLRC(lrc));
        }).catch(() => {});

      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Playback failed');
          setLoading(false);
        }
      }
    }
    start();
    return () => { cancelled = true; };
  }, [song]);

  // Poll mpv status
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(async () => {
      const mpv = mpvRef.current;
      if (!mpv) return;
      try {
        const [pos, dur, p, vol] = await Promise.all([
          mpv.getProperty('time-pos').catch(() => 0),
          mpv.getProperty('duration').catch(() => 0),
          mpv.getProperty('pause').catch(() => false),
          mpv.getProperty('volume').catch(() => 80),
        ]);
        setPosition(Math.floor(pos as number));
        setDuration(Math.floor(dur as number));
        setPaused(p as boolean);
        setVolume(Math.floor(vol as number));
      } catch {}
    }, 500);
    return () => clearInterval(timer);
  }, [playing]);

  // Keyboard controls
  useInput((input, key) => {
    const mpv = mpvRef.current;
    if (!mpv) return;

    if (input === ' ') {
      mpv.setProperty('pause', !paused).catch(() => {});
    }
    if (key.leftArrow) {
      mpv.command(['seek', -5, 'relative']).catch(() => {});
    }
    if (key.rightArrow) {
      mpv.command(['seek', 5, 'relative']).catch(() => {});
    }
    if (key.upArrow) {
      const v = Math.min(volume + 5, 100);
      mpv.setProperty('volume', v).catch(() => {});
    }
    if (key.downArrow) {
      const v = Math.max(volume - 5, 0);
      mpv.setProperty('volume', v).catch(() => {});
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mpvRef.current?.disconnect();
    };
  }, []);

  if (loading) {
    return (
      <Box>
        <Text color="cyan">Loading: {song.name} - {song.artist}...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
        <Text color="gray">Press Esc to go back</Text>
      </Box>
    );
  }

  // Progress bar
  const barWidth = 40;
  const progress = duration > 0 ? Math.floor((position / duration) * barWidth) : 0;
  const bar = '█'.repeat(progress) + '░'.repeat(barWidth - progress);

  // Current lyric
  const lyricIdx = getCurrentLine(lyrics, position);
  const lyricContext = lyrics.length > 0 ? getLyricContext(lyrics, lyricIdx, 3) : [];

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={paused ? 'yellow' : 'green'} bold>
          {paused ? '⏸' : '▶'}
        </Text>
        <Text bold> {song.name}</Text>
        <Text color="gray"> - {song.artist}</Text>
        <Text color="gray" dimColor> [{song.source}]</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">{formatDuration(position)} </Text>
        <Text color="cyan">{bar}</Text>
        <Text color="gray"> {formatDuration(duration)}</Text>
        <Text color="gray">  Vol: {volume}%</Text>
      </Box>

      {lyricContext.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          {lyricContext.map((line, i) => (
            <Text
              key={`${line.time}-${i}`}
              color={line.active ? 'cyan' : 'gray'}
              bold={line.active}
              dimColor={!line.active}
            >
              {line.text}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

function getLyricContext(
  lyrics: LyricLine[],
  currentIdx: number,
  context: number,
): Array<{ text: string; time: number; active: boolean }> {
  const start = Math.max(0, currentIdx - context);
  const end = Math.min(lyrics.length, currentIdx + context + 1);
  return lyrics.slice(start, end).map((line, i) => ({
    text: line.text,
    time: line.time,
    active: start + i === currentIdx,
  }));
}

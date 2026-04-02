import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Song } from '../providers/types.js';
import { formatDuration, truncate } from '../utils/format.js';

interface ResultsViewProps {
  songs: Song[];
  keyword: string;
  onPlay: (song: Song) => void;
}

const SOURCE_COLORS: Record<string, string> = {
  kuwo: 'yellow',
  qq: 'green',
  kugou: 'blue',
  netease: 'red',
};

const PAGE_SIZE = 15;

export function ResultsView({ songs, keyword, onPlay }: ResultsViewProps) {
  const [cursor, setCursor] = useState(0);
  const [offset, setOffset] = useState(0);

  useInput((input, key) => {
    if (input === 'j' || key.downArrow) {
      const next = Math.min(cursor + 1, songs.length - 1);
      setCursor(next);
      if (next >= offset + PAGE_SIZE) setOffset(next - PAGE_SIZE + 1);
    }
    if (input === 'k' || key.upArrow) {
      const prev = Math.max(cursor - 1, 0);
      setCursor(prev);
      if (prev < offset) setOffset(prev);
    }
    if (key.return) {
      onPlay(songs[cursor]);
    }
  });

  const visible = songs.slice(offset, offset + PAGE_SIZE);

  return (
    <Box flexDirection="column">
      <Text color="gray">
        Results for "<Text color="white">{keyword}</Text>" ({songs.length} songs)
      </Text>
      <Box marginTop={1} flexDirection="column">
        {visible.map((song, i) => {
          const idx = offset + i;
          const selected = idx === cursor;
          return (
            <Box key={`${song.source}-${song.id}`}>
              <Text color={selected ? 'cyan' : 'gray'}>
                {selected ? '▸ ' : '  '}
              </Text>
              <Text
                color={selected ? 'white' : undefined}
                bold={selected}
                wrap="truncate"
              >
                {truncate(song.name, 25).padEnd(25)}
              </Text>
              <Text color="gray"> </Text>
              <Text
                color={selected ? 'white' : 'gray'}
                wrap="truncate"
              >
                {truncate(song.artist, 15).padEnd(15)}
              </Text>
              <Text color="gray"> </Text>
              <Text color="gray">{formatDuration(song.duration)} </Text>
              <Text color={SOURCE_COLORS[song.source] ?? 'gray'}>
                {song.source.padEnd(7)}
              </Text>
            </Box>
          );
        })}
      </Box>
      {songs.length > PAGE_SIZE && (
        <Box marginTop={1}>
          <Text color="gray">
            {offset + 1}-{Math.min(offset + PAGE_SIZE, songs.length)} of {songs.length}
          </Text>
        </Box>
      )}
    </Box>
  );
}

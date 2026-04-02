import React, { useState, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { SearchView } from './search-view.js';
import { ResultsView } from './results-view.js';
import { PlayerView } from './player-view.js';
import { Song } from '../providers/types.js';

type View = 'search' | 'results' | 'player';

export function App() {
  const { exit } = useApp();
  const [view, setView] = useState<View>('search');
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [keyword, setKeyword] = useState('');

  const handleSearch = useCallback((results: Song[], kw: string) => {
    setSongs(results);
    setKeyword(kw);
    if (results.length > 0) {
      setView('results');
    }
  }, []);

  const handlePlay = useCallback((song: Song) => {
    setCurrentSong(song);
    setView('player');
  }, []);

  const handleBack = useCallback(() => {
    if (view === 'player') setView('results');
    else if (view === 'results') setView('search');
  }, [view]);

  useInput((input, key) => {
    if (input === 'q' && view === 'search') {
      exit();
    }
    if (key.escape) {
      handleBack();
    }
  });

  return (
    <Box flexDirection="column" width="100%">
      <Box marginBottom={1}>
        <Text bold color="cyan">♪ play-music</Text>
        <Text color="gray"> | </Text>
        <Text color="gray">
          {view === 'search' && 'Enter to search, q to quit'}
          {view === 'results' && 'j/k navigate, Enter play, Esc back'}
          {view === 'player' && 'Space pause, ←→ seek, ↑↓ volume, Esc back'}
        </Text>
      </Box>

      {view === 'search' && (
        <SearchView onSearch={handleSearch} initialKeyword={keyword} />
      )}
      {view === 'results' && (
        <ResultsView songs={songs} keyword={keyword} onPlay={handlePlay} />
      )}
      {view === 'player' && currentSong && (
        <PlayerView song={currentSong} allSongs={songs} />
      )}
    </Box>
  );
}

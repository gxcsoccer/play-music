import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { searchAll } from '../providers/registry.js';
import { Song } from '../providers/types.js';

interface SearchViewProps {
  onSearch: (results: Song[], keyword: string) => void;
  initialKeyword: string;
}

export function SearchView({ onSearch, initialKeyword }: SearchViewProps) {
  const [query, setQuery] = useState(initialKeyword);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async (value: string) => {
    if (!value.trim()) return;
    setLoading(true);
    setError('');
    try {
      const results = await searchAll(value.trim(), undefined, 20);
      if (results.length === 0) {
        setError('No results found');
      } else {
        onSearch(results, value.trim());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [onSearch]);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="yellow">Search: </Text>
        {loading ? (
          <Text color="gray">{query}</Text>
        ) : (
          <TextInput
            value={query}
            onChange={setQuery}
            onSubmit={handleSubmit}
            placeholder="Song name, artist..."
          />
        )}
      </Box>
      {loading && (
        <Box marginTop={1}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text color="gray"> Searching all sources...</Text>
        </Box>
      )}
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}
    </Box>
  );
}

#!/usr/bin/env node

import { Command } from 'commander';

// Lazy-load providers only when needed (saves ~5s on control commands)
let providersLoaded = false;
async function ensureProviders() {
  if (providersLoaded) return;
  const { register } = await import('./providers/registry.js');
  const [{ kuwoProvider }, { qqProvider }, { kugouProvider }, { neteaseProvider }] =
    await Promise.all([
      import('./providers/kuwo.js'),
      import('./providers/qq.js'),
      import('./providers/kugou.js'),
      import('./providers/netease.js'),
    ]);
  register(kuwoProvider);
  register(qqProvider);
  register(kugouProvider);
  register(neteaseProvider);
  providersLoaded = true;
}

const program = new Command();

program
  .name('play-music')
  .description('AI-friendly CLI for music search, playback, and download')
  .version('0.1.0');

// --- Heavy commands: lazy-load providers ---

program
  .command('search <keyword>')
  .description('Search for songs across music sources')
  .option('--json', 'Output as JSON')
  .option('--source <sources>', 'Comma-separated sources: netease,qq,kugou,kuwo')
  .option('--limit <n>', 'Max results per source', '20')
  .action(async (keyword, opts) => {
    await ensureProviders();
    const { searchCommand } = await import('./commands/search.js');
    await searchCommand(keyword, opts);
  });

program
  .command('play <keyword>')
  .description('Search and play the best matching song')
  .option('--json', 'Output as JSON')
  .option('--source <source>', 'Music source to use')
  .action(async (keyword, opts) => {
    await ensureProviders();
    const { playCommand } = await import('./commands/play.js');
    await playCommand(keyword, opts);
  });

program
  .command('download <keyword>')
  .description('Download a song')
  .option('--json', 'Output as JSON')
  .option('--source <source>', 'Music source to use')
  .option('-o, --output <dir>', 'Output directory', '~/Music')
  .action(async (keyword, opts) => {
    await ensureProviders();
    const { downloadCommand } = await import('./commands/download.js');
    await downloadCommand(keyword, opts);
  });

program
  .command('lyric')
  .description('Show lyrics of current song')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    await ensureProviders();
    const { lyricCommand } = await import('./commands/lyric.js');
    await lyricCommand(opts);
  });

program
  .command('next')
  .description('Play next song in playlist')
  .action(async () => {
    await ensureProviders();
    const { nextCommand } = await import('./commands/play.js');
    await nextCommand();
  });

program
  .command('prev')
  .description('Play previous song in playlist')
  .action(async () => {
    await ensureProviders();
    const { prevCommand } = await import('./commands/play.js');
    await prevCommand();
  });

program
  .command('queue <keyword>')
  .description('Add a song to the playlist')
  .option('--json', 'Output as JSON')
  .option('--source <source>', 'Music source to use')
  .action(async (keyword, opts) => {
    await ensureProviders();
    const { queueCommand } = await import('./commands/play.js');
    await queueCommand(keyword, opts);
  });

program
  .command('list')
  .description('Show current playlist')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const { listCommand } = await import('./commands/play.js');
    await listCommand(opts);
  });

program
  .command('clear')
  .description('Clear playlist (keep current song)')
  .action(async () => {
    const { clearCommand } = await import('./commands/play.js');
    await clearCommand();
  });

// --- Lightweight control commands: NO provider loading, instant response ---

program
  .command('pause')
  .description('Pause playback')
  .action(async () => {
    const { pauseCommand } = await import('./commands/control.js');
    await pauseCommand();
  });

program
  .command('resume')
  .description('Resume playback')
  .action(async () => {
    const { resumeCommand } = await import('./commands/control.js');
    await resumeCommand();
  });

program
  .command('stop')
  .description('Stop playback')
  .action(async () => {
    const { stopCommand } = await import('./commands/control.js');
    await stopCommand();
  });

program
  .command('repeat [mode]')
  .description('Toggle repeat mode (off/one/all)')
  .action(async (mode) => {
    const { repeatCommand } = await import('./commands/control.js');
    await repeatCommand(mode);
  });

program
  .command('status')
  .description('Show current playback status')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const { statusCommand } = await import('./commands/status.js');
    await statusCommand(opts);
  });

program
  .command('volume <level>')
  .description('Set volume (0-100)')
  .action(async (level) => {
    const { volumeCommand } = await import('./commands/control.js');
    await volumeCommand(level);
  });

program
  .command('seek <target>')
  .description('Seek to position (seconds, or +/-N for relative)')
  .action(async (target) => {
    const { seekCommand } = await import('./commands/control.js');
    await seekCommand(target);
  });

program
  .command('tui')
  .description('Launch interactive TUI')
  .action(async () => {
    await ensureProviders();
    const { render } = await import('ink');
    const React = await import('react');
    const { App } = await import('./ui/app.js');
    render(React.createElement(App));
  });

program
  .command('claude')
  .description('Install skill + statusline into Claude Code')
  .option('--uninstall', 'Remove from Claude Code')
  .action(async (opts) => {
    const { setupCommand } = await import('./commands/setup.js');
    await setupCommand(opts);
  });

// No args → TUI; unknown command → error
const parsed = program.parse();
if (process.argv.length <= 2) {
  // no sub-command given, launch TUI
  program.commands.find(c => c.name() === 'tui')!.parseAsync([]);
}

import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, chmodSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const HOME = process.env.HOME ?? '';
const CLAUDE_DIR = join(HOME, '.claude');
const SKILL_DIR = join(CLAUDE_DIR, 'skills', 'ting');
const STATUSLINE_PATH = join(CLAUDE_DIR, 'statusline-ting.sh');
const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');

const SKILL_CONTENT = `---
description: Search and play music from the terminal. Use when the user asks to play music, search for songs, listen to something, or take a music break while coding.
---

# Music Player (tingge)

Control music playback via the \`ting\` CLI. All commands return instantly.

## Quick Actions

**Play a song** (searches all sources, auto-fallback):
\`\`\`bash
ting play "song name artist" --json
\`\`\`

**Control playback** (<50ms response):
\`\`\`bash
ting pause       # Pause
ting resume      # Resume
ting stop        # Stop
ting volume 60   # Volume (0-100)
ting seek +30    # Seek forward 30s
ting seek -10    # Seek back 10s
\`\`\`

**Query status**:
\`\`\`bash
ting status --json
\`\`\`

**Search**:
\`\`\`bash
ting search "keyword" --json --limit 5
\`\`\`

**Download**:
\`\`\`bash
ting download "song name" -o ~/Music --json
\`\`\`

## Output Format

All \`--json\` output: \`{"ok": true/false, "data": ..., "error": ...}\`

## Notes

- Music sources: kuwo (best free), qq, kugou, netease
- \`play\` auto-tries all sources if one fails (VIP/copyright)
- Control commands (pause/resume/stop) output human text in TTY, JSON when piped
- Requires: \`brew install mpv\`
`;

function findStatuslineScript(): string | null {
  // Find the statusline.sh bundled with the npm package
  try {
    const pkgDir = execSync('npm ls -g tingge --parseable 2>/dev/null || npm ls -g @gxcsoccer/play-music --parseable 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (pkgDir) {
      const candidate = join(pkgDir, 'scripts', 'statusline.sh');
      if (existsSync(candidate)) return candidate;
    }
  } catch {}

  // Fallback: look relative to this script
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(thisDir, '..', 'scripts', 'statusline.sh'),
    join(thisDir, '..', '..', 'scripts', 'statusline.sh'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function readSettings(): Record<string, any> {
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeSettings(settings: Record<string, any>) {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
}

export async function setupCommand(opts: { uninstall?: boolean }): Promise<void> {
  if (opts.uninstall) {
    return uninstall();
  }

  console.log('Setting up tingge for Claude Code...\n');

  // 1. Install skill
  mkdirSync(SKILL_DIR, { recursive: true });
  writeFileSync(join(SKILL_DIR, 'SKILL.md'), SKILL_CONTENT);
  console.log(`  ✓ Skill installed → ~/.claude/skills/ting/SKILL.md`);

  // 2. Install statusline
  const srcScript = findStatuslineScript();
  if (srcScript) {
    copyFileSync(srcScript, STATUSLINE_PATH);
    chmodSync(STATUSLINE_PATH, 0o755);
    console.log(`  ✓ Statusline installed → ~/.claude/statusline-ting.sh`);
  } else {
    console.log(`  ⚠ Statusline script not found, skipping (you can copy scripts/statusline.sh manually)`);
  }

  // 3. Update settings.json
  mkdirSync(CLAUDE_DIR, { recursive: true });
  const settings = readSettings();

  // Statusline
  const hadStatusline = !!settings.statusLine;
  settings.statusLine = {
    type: 'command',
    command: STATUSLINE_PATH,
  };

  // Auto-allow ting commands (no approval prompt)
  const TING_PERM = 'Bash(ting *)';
  if (!settings.permissions) settings.permissions = {};
  if (!Array.isArray(settings.permissions.allow)) settings.permissions.allow = [];
  if (!settings.permissions.allow.includes(TING_PERM)) {
    settings.permissions.allow.push(TING_PERM);
    console.log(`  ✓ Permission added → Bash(ting *) auto-allowed`);
  } else {
    console.log(`  ✓ Permission already configured`);
  }

  writeSettings(settings);

  if (hadStatusline) {
    console.log(`  ✓ Statusline config updated (previous config overwritten)`);
  } else {
    console.log(`  ✓ Statusline config added → ~/.claude/settings.json`);
  }

  console.log(`
Done! Restart Claude Code to activate.

  Skill:      Use /ting in Claude Code, or just say "play a song"
  Statusline: Shows ♪ song - artist while music plays

  Try: ting play "晴天 周杰伦"
`);
}

function uninstall() {
  console.log('Removing tingge from Claude Code...\n');

  // Remove skill
  try {
    rmSync(SKILL_DIR, { recursive: true });
    console.log('  ✓ Skill removed');
  } catch {
    console.log('  - Skill not found, skipping');
  }

  // Remove statusline script
  try {
    rmSync(STATUSLINE_PATH);
    console.log('  ✓ Statusline script removed');
  } catch {
    console.log('  - Statusline script not found, skipping');
  }

  // Remove statusline from settings
  const settings = readSettings();
  if (settings.statusLine?.command === STATUSLINE_PATH) {
    delete settings.statusLine;
    writeSettings(settings);
    console.log('  ✓ Statusline config removed from settings.json');
  }

  console.log('\nDone! Restart Claude Code to apply changes.');
}

#!/bin/bash
# Claude Code statusline - colorful with music animation

input=$(cat)

MODEL=$(echo "$input" | jq -r '.model.display_name // "Claude"')
USED_PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
CWD=$(echo "$input" | jq -r '.workspace.current_dir // empty')

# Shorten home directory to ~
if [ -n "$CWD" ]; then
  CWD="${CWD/#$HOME/~}"
fi

# Git branch
GIT_BRANCH=""
if [ -n "$CWD" ]; then
  EXPANDED_CWD="${CWD/#\~/$HOME}"
  GIT_BRANCH=$(git -C "$EXPANDED_CWD" symbolic-ref --short HEAD 2>/dev/null \
    || git -C "$EXPANDED_CWD" rev-parse --short HEAD 2>/dev/null)
  if [ -n "$GIT_BRANCH" ]; then
    GIT_DIRTY=$(git -C "$EXPANDED_CWD" status --porcelain 2>/dev/null)
    [ -n "$GIT_DIRTY" ] && GIT_BRANCH="${GIT_BRANCH}*"
  fi
fi

# ANSI colors
RST="\033[0m"
DIM="\033[2m"
BOLD="\033[1m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
MAGENTA="\033[35m"
BLUE="\033[34m"
RED="\033[31m"

# Context color: green → yellow → red
if [ "$USED_PCT" -ge 80 ]; then
  CTX_COLOR="$RED"
elif [ "$USED_PCT" -ge 50 ]; then
  CTX_COLOR="$YELLOW"
else
  CTX_COLOR="$GREEN"
fi

# Music player info with animation
MUSIC=""
STATE_FILE="$HOME/.play-music/state.json"
MPV_SOCK="$HOME/.play-music/mpv.sock"

if [ -f "$STATE_FILE" ] && [ -S "$MPV_SOCK" ]; then
  SONG=$(jq -r '.song.name // empty' "$STATE_FILE" 2>/dev/null)
  ARTIST=$(jq -r '.song.artist // empty' "$STATE_FILE" 2>/dev/null)

  if [ -n "$SONG" ]; then
    PAUSED=$(node -e "
      let done=false;
      const s=require('net').createConnection(process.env.HOME+'/.play-music/mpv.sock',()=>{
        s.write('{\"command\":[\"get_property\",\"pause\"],\"request_id\":1}\n');
      });
      s.on('data',d=>{
        if(done)return;
        for(const line of d.toString().trim().split('\n')){
          try{const j=JSON.parse(line);if(j.request_id===1){done=true;console.log(j.data===true?'true':'false');s.destroy();process.exit(0)}}catch{}
        }
      });
      s.on('error',()=>{if(!done){done=true;console.log('false');process.exit(0)}});
      setTimeout(()=>{if(!done){done=true;console.log('false');process.exit(0)}},500);
    " 2>/dev/null)

    [ ${#SONG} -gt 15 ] && SONG="${SONG:0:14}…"
    [ ${#ARTIST} -gt 10 ] && ARTIST="${ARTIST:0:9}…"

    if [ "$PAUSED" = "true" ]; then
      MUSIC=" ${DIM}│${RST} ${YELLOW}⏸ ${SONG}${RST}${DIM} - ${ARTIST}${RST}"
    else
      MUSIC=" ${DIM}│${RST} ${GREEN}♫${RST} ${MAGENTA}${BOLD}${SONG}${RST}${DIM} - ${CYAN}${ARTIST}${RST}"
    fi
  fi
fi

# Build: user@host │ dir (branch) │ model │ ctx% │ ▁▃▅▇ song - artist
USER_HOST="$(whoami)@$(hostname -s)"
DIR_PART="${BLUE}${CWD}${RST}"
[ -n "$GIT_BRANCH" ] && DIR_PART="${DIR_PART} ${YELLOW}${GIT_BRANCH}${RST}"

printf "${DIM}${USER_HOST}${RST} ${DIM}│${RST} ${DIR_PART} ${DIM}│${RST} ${CYAN}${MODEL}${RST} ${DIM}│${RST} ${CTX_COLOR}ctx ${USED_PCT}%%${RST}${MUSIC}"

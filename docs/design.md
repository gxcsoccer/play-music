# play-music: macOS 音乐搜索、播放、下载 CLI

## Context

创建一个 macOS 上的命令行音乐工具，支持从网易云、QQ音乐、酷狗、酷我四大平台搜索、在线播放、下载歌曲并显示歌词。核心差异化设计：**AI friendly** —— 可作为 Claude Code skill 使用，让 AI agent 在 vibe coding 间隙帮用户放歌。

参考项目：`go-music-dl`（Go, Windows, 11 个音乐源, bubbletea TUI）—— 注意：参考项目是**下载工具**而非播放器，不包含播放功能，播放部分需全新设计。

## 技术选型

| 项目 | 选择 | 理由 |
|------|------|------|
| 语言 | TypeScript (Node.js) | 生态丰富，CLI 库成熟 |
| TUI | ink v6 (React for CLI) | 最新稳定版 6.8.0，支持实时更新（进度条/歌词滚动），组件化 |
| 播放器 | mpv (自封装 IPC JSON 协议) | 支持在线流播放、进度控制、音量调节，brew install mpv |
| HTTP | 内置 fetch (Node 18+) | 原生支持，足够处理 Cookie/Referer 等自定义 Headers |
| CLI 框架 | commander | 解析命令和参数 |
| 构建 | tsup | 打包为可执行 CLI |
| 音频元数据 | ffmpeg (child_process) | 嵌入封面、歌词到 ID3 标签 |
| 加密 | Node.js crypto 模块 | 网易云 AES/RSA、酷狗 MD5 签名等音乐源加密需求 |

## 双模式架构：人类交互 + AI Agent

### 模式 1: 交互式 TUI（人类使用）
```bash
play-music                    # 启动交互式 TUI
```
全屏 ink 界面，搜索框 → 结果列表 → 播放控制/歌词显示

### 模式 2: 非交互式 CLI（AI Agent / skill 使用）
```bash
play-music search "周杰伦晴天" --json        # 搜索，返回 JSON
play-music play <songId> --source netease    # 播放指定歌曲（后台 mpv）
play-music play "周杰伦 晴天"                 # 搜索并直接播放最佳匹配
play-music pause                              # 暂停
play-music resume                             # 继续
play-music stop                               # 停止
play-music status --json                      # 当前播放状态（JSON）
play-music next                               # 下一首
play-music download "周杰伦晴天" -o ~/Music   # 下载
play-music lyric --json                       # 获取当前歌曲歌词
```

AI agent 通过 `--json` flag 获取结构化输出，通过命令参数完成所有操作，无需交互。

### 模式 3: Claude Code Skill
在项目下创建 `.claude/commands/play-music.md`，让 Claude Code 可以通过 `/play-music` 调用：

```markdown
# 音乐搜索与播放

当用户要求播放音乐、搜歌、听歌时使用此 skill。

## 可用命令

- 搜索: `play-music search "关键词" --json`
- 播放: `play-music play "歌名 歌手"`（后台播放，立即返回）
- 状态: `play-music status --json`
- 暂停/继续: `play-music pause` / `play-music resume`
- 停止: `play-music stop`

## 使用示例

用户说"放首歌"时，先搜索，选第一首播放：
1. 运行 `play-music play "歌名"` 即可自动搜索最佳匹配并播放
```

## 项目结构

```
play-music/
  package.json
  tsconfig.json
  src/
    index.ts                   # CLI 入口：commander 定义命令
    app.tsx                    # TUI 模式：ink Root 组件
    
    commands/                  # 非交互式命令实现（AI 友好）
      search.ts                # search 命令 → JSON 输出
      play.ts                  # play/pause/resume/stop/next
      download.ts              # download 命令
      status.ts                # status 命令 → 当前播放信息
    
    providers/                 # 音乐源抽象层
      types.ts                 # MusicProvider 接口, Song/Playlist 模型
      registry.ts              # Provider 注册表 + 并发聚合搜索
      netease.ts               # 网易云音乐
      qq.ts                    # QQ 音乐
      kugou.ts                 # 酷狗音乐
      kuwo.ts                  # 酷我音乐
    
    player/                    # 播放器层
      mpv.ts                   # mpv IPC JSON 协议封装（自实现，不依赖 node-mpv）
      lyrics.ts                # LRC 歌词解析 + 时间同步
      daemon.ts                # 后台播放守护进程（管理 mpv + 状态同步）
    
    ui/                        # ink TUI 组件
      search-view.tsx          # 搜索输入 + 音乐源选择
      results-view.tsx         # 结果列表（j/k导航, space选择, enter确认）
      player-view.tsx          # 播放控制面板 + 进度条 + 歌词
      download-view.tsx        # 下载进度
      components/
        song-table.tsx         # 歌曲表格组件
        progress-bar.tsx       # 进度条
        lyrics-display.tsx     # 滚动歌词
    
    download/
      downloader.ts            # 下载 + 流式写入 + 进度回调
      metadata.ts              # ffmpeg 嵌入 ID3 标签（封面/歌词）
    
    utils/
      http.ts                  # 带音乐源特定 Headers 的 HTTP 客户端
      similarity.ts            # Levenshtein 距离，歌曲相似度匹配
      format.ts                # 时间格式化、文件名清理
      state.ts                 # 持久化播放状态（~/.play-music/state.json）
```

## 核心数据模型

```typescript
// providers/types.ts
export type SourceName = 'netease' | 'qq' | 'kugou' | 'kuwo';

export interface Song {
  id: string;
  source: SourceName;
  name: string;
  artist: string;
  album?: string;
  duration: number;        // 秒
  cover?: string;          // URL
  ext?: string;            // mp3, flac
  extra?: Record<string, unknown>; // 平台特有数据（如酷狗的 hash、QQ 的 songmid）
}

export interface MusicProvider {
  readonly name: SourceName;
  search(keyword: string, limit?: number): Promise<Song[]>;
  getSongUrl(song: Song): Promise<string>;    // 播放/下载 URL（注意：URL 有时效性，需按需获取）
  getLyrics(song: Song): Promise<string>;      // LRC 格式歌词
}

// 统一的 JSON 输出格式（AI 友好）
export interface CliOutput<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
```

## 核心接口：Provider 注册与并发搜索

```typescript
// providers/registry.ts
const providers = new Map<SourceName, MusicProvider>();

export function register(provider: MusicProvider) {
  providers.set(provider.name, provider);
}

export async function searchAll(keyword: string, sources?: SourceName[]): Promise<Song[]> {
  const targets = sources ?? [...providers.keys()];
  const results = await Promise.allSettled(
    targets.map(src => providers.get(src)!.search(keyword))
  );
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}
```

## 播放器后台管理（AI 友好的关键）

AI agent 调用 `play-music play` 后需要命令立即返回，音乐在后台播放。

### 架构：直接启动 mpv detached 进程 + IPC socket 实时查询

```
┌─────────────────┐      IPC socket       ┌──────────────┐
│ play-music CLI  │ ◄──────────────────►  │  mpv 进程     │
│ (短暂运行)       │  ~/.play-music/       │ (后台 detached)│
│                 │    mpv.sock            │              │
└─────────────────┘                        └──────────────┘
        │                                         │
        ▼                                         │
  ~/.play-music/state.json                        │
  (song 元信息 + playlist)                   音频输出到系统
```

**关键设计决策：**
- mpv 自带 `--input-ipc-server` 参数创建 Unix socket，支持 JSON IPC 协议
- **不需要额外的 daemon 进程**：直接 spawn detached mpv，通过 IPC socket 查询实时状态（position/duration/pause）
- `state.json` 只存储 song 元信息和 playlist 队列（mpv 不知道这些）
- `play-music status` 连接 IPC socket 获取 position/duration/paused，合并 state.json 的 song 信息

```typescript
// player/daemon.ts
// 状态文件只存 mpv 不知道的信息
interface PlayState {
  song: Song | null;        // 当前歌曲元信息
  playlist: Song[];         // 播放队列
  currentIndex: number;     // 当前播放索引
  volume: number;           // 音量（也可从 mpv 查询）
}
// position/duration/paused 实时从 mpv IPC socket 查询，不写文件

// mpv IPC JSON 协议示例：
// 发送: {"command": ["get_property", "time-pos"]}\n
// 接收: {"data": 45.2, "error": "success"}
```

- 状态文件路径: `~/.play-music/state.json`
- IPC socket 路径: `~/.play-music/mpv.sock`

**歌曲 URL 时效性处理：**
- 音乐平台的播放 URL 通常有时效（几分钟到几小时不等）
- playlist 中存储 Song 对象（含 id/source），播放下一首时实时调用 `getSongUrl()` 获取新 URL
- 不预先批量获取所有 URL

这样 AI agent 可以：
1. `play-music play "周杰伦 晴天"` → 搜索最佳匹配，后台播放，返回歌曲信息 JSON
2. `play-music status --json` → 实时查看播放状态
3. `play-music pause` → 暂停
4. 整个过程不阻塞 agent 的执行流

## CLI 命令设计

```
play-music [tui]                          # 启动交互式 TUI（默认）
play-music search <keyword> [--json] [--source netease,qq,kugou,kuwo] [--limit 20]
play-music play <keyword|songId> [--source netease] [--json]
play-music pause
play-music resume  
play-music stop
play-music next
play-music prev
play-music status [--json]
play-music volume <0-100>
play-music seek <seconds|+10|-10>
play-music lyric [--json]
play-music download <keyword|songId> [--source netease] [--output ~/Music] [--format mp3|flac] [--embed-meta]
```

### `--json` 输出格式

所有 `--json` 输出统一格式，方便 AI 解析：

```json
// 成功: play-music search "晴天" --json
{
  "ok": true,
  "data": {
    "songs": [
      { "id": "186016", "source": "netease", "name": "晴天", "artist": "周杰伦", "album": "叶惠美", "duration": 269 },
      { "id": "003OUlho2HcRHC", "source": "qq", "name": "晴天", "artist": "周杰伦", "album": "叶惠美", "duration": 269 }
    ]
  }
}

// 成功: play-music status --json
{
  "ok": true,
  "data": {
    "song": { "id": "186016", "source": "netease", "name": "晴天", "artist": "周杰伦" },
    "position": 45,
    "duration": 269,
    "paused": false,
    "volume": 80,
    "playlistLength": 3,
    "currentIndex": 0
  }
}

// 失败:
{
  "ok": false,
  "error": "mpv is not running"
}

// play-music play "晴天" 的输出（非 --json 时也输出简洁信息给 AI）
{
  "ok": true,
  "data": {
    "action": "playing",
    "song": { "id": "186016", "source": "netease", "name": "晴天", "artist": "周杰伦" }
  }
}
```

**play 命令的最佳匹配策略：**
- 搜索所有启用的源，收集结果
- 按歌曲名与关键词的相似度排序（Levenshtein 距离）
- 取相似度最高的第一首
- 如果指定了 `--source`，只搜索该源

## 各音乐源 API 详情（来自参考项目 music-lib 源码分析）

这是实现复杂度最高的部分，每个平台都有不同的加密和认证方式。

### 网易云音乐 (Netease) — 复杂度：高

| 功能 | 端点 | 加密方式 |
|------|------|---------|
| 搜索 | `POST http://music.163.com/api/linux/forward` | AES-128-ECB |
| 播放 URL | `POST http://music.163.com/weapi/song/enhance/player/url` | AES-128-CBC + RSA (WeAPI) |
| 歌词 | `POST https://music.163.com/weapi/song/lyric` | WeAPI 加密 |
| 歌曲详情 | `POST https://music.163.com/weapi/v3/song/detail` | WeAPI 加密 |

**WeAPI 加密流程（核心）：**
1. AES-128-CBC 加密 payload，key=`0CoJUm6Qyw8W8jud`，iv=`0102030405060708`
2. 生成随机 16 字节 secKey，再次 AES-128-CBC 加密步骤 1 的结果
3. RSA 加密 secKey（公钥 modulus 和 exponent 固定）
4. POST 参数：`params`（加密数据）+ `encSecKey`（RSA 加密的 key）

### QQ 音乐 — 复杂度：中

| 功能 | 端点 | 方式 |
|------|------|------|
| 搜索 | `GET http://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp` | 明文 query params |
| 播放 URL | `POST https://u.y.qq.com/cgi-bin/musicu.fcg` | JSON body，需 GUID |
| 歌词 | `GET http://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg` | 明文，歌词 base64 编码 |

**关键点：** 播放 URL 需构造特定 JSON 请求体（含 module/method/param），quality prefix 决定音质（M500=128k, M800=320k, F000=FLAC）。URL 格式：`https://ws.stream.qqmusic.qq.com/{purl}`

### 酷狗音乐 (KuGou) — 复杂度：中

| 功能 | 端点 | 方式 |
|------|------|------|
| 搜索 | `GET http://songsearch.kugou.com/song_search_v2` | 明文 |
| 播放 URL | `GET https://wwwapi.kugou.com/play/songinfo` | MD5 签名 |
| 歌词 | `GET http://krcs.kugou.com/search` + `GET http://lyrics.kugou.com/download` | 两步：搜索→下载 |

**签名算法：** `MD5("NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt" + 排序参数 + "NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt")`

搜索返回 `FileHash`（标准）、`HQFileHash`（高品质）、`SQFileHash`（无损），用不同 hash 请求不同品质的 URL。

### 酷我音乐 (KuWo) — 复杂度：低

| 功能 | 端点 | 方式 |
|------|------|------|
| 搜索 | `GET http://www.kuwo.cn/search/searchMusicBykeyWord` | 明文 |
| 播放 URL | `GET https://mobi.kuwo.cn/mobi.s` | 明文，带 device params |
| 歌词 | `GET http://m.kuwo.cn/newh5/singles/songinfoandlrc` | 明文，JSON 中提取 |

**最简单的源：** 无加密，直接 HTTP GET，返回流媒体 URL。歌词在歌曲详情接口中一并返回。

### 实现建议

1. **优先从酷我开始**（最简单，无加密，适合验证整个流程）
2. 然后 QQ 音乐（中等复杂度，搜索明文，URL 获取需构造 JSON）
3. 然后酷狗（需实现 MD5 签名）
4. 最后网易云（需实现完整的 WeAPI 加密：AES + RSA）

每个 provider 建议参考 `/Users/bytedance/go/1.22.12/pkg/mod/github.com/guohuiyuan/music-lib@v1.0.6-*/` 中的对应实现。

## mpv IPC 协议封装

mpv 的 JSON IPC 非常简单，无需第三方库：

```typescript
// player/mpv.ts — 自封装，~100 行
// mpv 启动参数: mpv --no-video --input-ipc-server=~/.play-music/mpv.sock <url>
// 通过 net.Socket 连接 Unix socket，发送 JSON 命令，读取 JSON 响应

// 发送: {"command": ["get_property", "time-pos"]}\n
// 接收: {"data": 45.2, "error": "success"}

// 发送: {"command": ["set_property", "pause", true]}\n
// 发送: {"command": ["loadfile", "https://...mp3"]}\n
// 发送: {"command": ["get_property", "duration"]}\n

// 核心 API:
class MpvIPC {
  connect(socketPath: string): Promise<void>
  command(args: string[]): Promise<any>
  getProperty(name: string): Promise<any>
  setProperty(name: string, value: any): Promise<void>
  observe(property: string, cb: (value: any) => void): void
  disconnect(): void
}
```

## 实现顺序

### Phase 1: 项目骨架 + 酷我（最简单的源，验证流程）
1. 初始化项目：package.json, tsconfig.json, 安装依赖
2. `src/providers/types.ts` — 核心模型和接口（含 CliOutput 统一输出格式）
3. `src/providers/registry.ts` — Provider 注册和并发搜索
4. `src/providers/kuwo.ts` — 酷我实现（无加密，最快跑通全流程）
5. `src/utils/http.ts` — 带平台特定 Headers 的 HTTP 客户端
6. `src/index.ts` — commander CLI 命令定义
7. `src/commands/search.ts` — search 命令（--json 输出）

### Phase 2: 播放器核心
8. `src/player/mpv.ts` — mpv IPC JSON 协议封装（自实现，~100 行）
9. `src/player/daemon.ts` — detached mpv 进程 + state.json 管理
10. `src/commands/play.ts` — play/pause/resume/stop/status/next/prev 命令
11. `src/commands/status.ts` — status 命令（IPC socket 查询实时状态）

### Phase 3: 下载 + 歌词
12. `src/download/downloader.ts` — 流式下载 + 进度
13. `src/download/metadata.ts` — ffmpeg 元数据嵌入
14. `src/player/lyrics.ts` — LRC 解析器
15. `src/commands/download.ts` — download 命令

### Phase 4: 剩余三个音乐源（按复杂度递增）
16. `src/providers/qq.ts` — QQ 音乐（中等：JSON 请求体 + GUID）
17. `src/providers/kugou.ts` — 酷狗（中等：MD5 签名）
18. `src/providers/netease.ts` — 网易云（复杂：AES-CBC + RSA 加密）

### Phase 5: 交互式 TUI
18. `src/app.tsx` — ink Root 组件 + 状态机
19. `src/ui/search-view.tsx` + `src/ui/results-view.tsx`
20. `src/ui/player-view.tsx` + `src/ui/components/lyrics-display.tsx`
21. `src/ui/download-view.tsx`

### Phase 6: Claude Code Skill 集成
22. 编写 `.claude/skills/play-music.md` skill 定义
23. 测试 AI agent 调用流程

## 依赖列表

```json
{
  "dependencies": {
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "@types/node": "^20.0.0"
  }
}
```

**Phase 5 (TUI) 时追加：**
```json
{
  "ink": "^6.0.0",
  "ink-text-input": "^6.0.0",
  "ink-spinner": "^5.0.0",
  "react": "^18.0.0",
  "@types/react": "^18.0.0"
}
```

**设计原则：最小依赖**
- mpv IPC 协议简单（Unix socket + JSON），自行封装 ~100 行代码，不依赖过时的 `node-mpv`（最后更新 2020 年）
- HTTP 用 Node 18+ 内置 `fetch`，不需要 undici/axios
- 加密用 Node.js 内置 `crypto` 模块
- TUI 依赖（ink/react）仅在 Phase 5 引入，且通过动态 import 加载，不影响非交互命令的启动速度

## 验证方案

1. **搜索测试**: `play-music search "周杰伦" --json` → 确认返回多源 JSON 结果
2. **播放测试**: `play-music play "晴天 周杰伦"` → 确认后台 mpv 启动，音乐播放
3. **状态测试**: `play-music status --json` → 确认返回当前播放状态
4. **控制测试**: `play-music pause` / `play-music resume` → 确认暂停/恢复
5. **下载测试**: `play-music download "晴天 周杰伦" -o /tmp` → 确认文件下载到指定目录
6. **歌词测试**: `play-music lyric --json` → 确认返回 LRC 歌词
7. **TUI 测试**: `play-music` → 确认交互式界面正常工作
8. **Skill 测试**: 在 Claude Code 中说 "播放一首周杰伦的晴天" → 确认 AI 正确调用 CLI

## 启动速度优化（AI 友好）

AI agent 频繁调用 CLI 命令（pause/resume/status），启动速度很重要：

- 非交互命令（search/play/pause/status）**不加载 ink/react**，仅引入 commander + 必要模块
- TUI 模式通过 `await import('ink')` 动态加载
- tsup 构建时可考虑将 TUI 和 CLI 分为两个 entry point

## 外部依赖检查

CLI 启动时检查外部依赖，给出友好提示：

```
$ play-music play "晴天"
Error: mpv not found. Install it with: brew install mpv

$ play-music download "晴天" --embed-meta
Warning: ffmpeg not found, metadata embedding will be skipped.
         Install with: brew install ffmpeg
```

## 参考项目关键文件

- `go-music-dl/core/service.go` — 搜索聚合、源检测、相似度算法
- `go-music-dl/core/download.go` — 下载逻辑、格式检测、元数据嵌入
- `go-music-dl/internal/cli/ui.go` — TUI 界面参考（注意：参考项目不含播放功能）
- 音乐源 API 实现: `~/go/1.22.12/pkg/mod/github.com/guohuiyuan/music-lib@v1.0.6-*/` — 各平台 API 端点、加密算法、请求格式的权威参考

# play-music

一个 AI 友好的命令行音乐搜索、播放、下载工具。支持网易云、QQ音乐、酷狗、酷我四大平台，可作为 Claude Code skill 使用，在 vibe coding 时随时来一首。

## 特性

- **四大音乐源** — 网易云、QQ音乐、酷狗、酷我，并发搜索，智能换源
- **在线播放** — 基于 mpv，后台播放不阻塞终端
- **AI 友好** — 所有命令支持 `--json` 输出，控制命令 <50ms 响应，可作为 Claude Code skill
- **交互式 TUI** — 基于 ink，搜索/选歌/播放/歌词一站式体验
- **歌词同步** — 播放时实时滚动显示 LRC 歌词
- **下载** — 支持 MP3/FLAC 下载到本地
- **Statusline** — 集成 Claude Code statusline，编码时底栏显示当前播放

## 安装

```bash
# 前置依赖（macOS）
brew install mpv

# 安装
npm install -g tingge
```

## 使用

> 支持短别名 `ting` 和 `mu`，例如 `ting play "晴天"` 或 `mu pause`。

### 交互式 TUI

```bash
pm
```

进入全屏交互界面，搜索歌曲、浏览结果、播放并显示歌词。

快捷键：

| 视图 | 按键 | 功能 |
|------|------|------|
| 搜索 | `Enter` | 执行搜索 |
| 搜索 | `q` | 退出 |
| 结果 | `j/k` 或 `↑↓` | 上下选择 |
| 结果 | `Enter` | 播放选中歌曲 |
| 结果 | `Esc` | 返回搜索 |
| 播放 | `Space` | 暂停/恢复 |
| 播放 | `←→` | 前进/后退 5 秒 |
| 播放 | `↑↓` | 音量加减 |
| 播放 | `Esc` | 返回列表 |

### 命令行模式

```bash
# 搜索
play-music search "周杰伦 晴天" --json

# 播放（后台，立即返回）
play-music play "晴天 周杰伦"
play-music play "晴天" --source kuwo     # 指定音乐源

# 播放控制
play-music pause                          # 暂停
play-music resume                         # 继续
play-music stop                           # 停止
play-music volume 60                      # 音量 (0-100)
play-music seek +30                       # 快进 30 秒
play-music seek -10                       # 后退 10 秒

# 状态查询
play-music status --json

# 歌词
play-music lyric --json

# 下载
play-music download "晴天 周杰伦" -o ~/Music
```

### JSON 输出格式

所有命令加 `--json` 返回统一格式：

```json
// 成功
{ "ok": true, "data": { ... } }

// 失败
{ "ok": false, "error": "error message" }
```

示例：

```bash
$ play-music status --json
{
  "ok": true,
  "data": {
    "song": { "name": "晴天", "artist": "周杰伦", "source": "kuwo" },
    "position": 45,
    "duration": 269,
    "paused": false,
    "volume": 80
  }
}
```

## 作为 Claude Code Skill 使用

一键配置 Skill + Statusline + 权限：

```bash
ting claude
```

这会自动完成：
- 安装 Skill 到 `~/.claude/skills/ting/`，支持 `/ting` 命令和自然语言触发
- 安装 Statusline 脚本，编码时底栏实时显示当前播放
- 添加 `Bash(ting *)` 权限，免确认执行播放控制

配置完成后重启 Claude Code，即可直接使用：

```
> 放首周杰伦的歌
> 暂停
> 现在在放什么
```

卸载：

```bash
ting claude --uninstall
```

## 性能

| 命令 | 耗时 | 说明 |
|------|------|------|
| `play "关键词"` | ~0.5s | 搜索 + 获取 URL + 启动 mpv |
| `pause / resume / stop` | ~40ms | 仅 mpv IPC 通信 |
| `status` | ~70ms | 查询 mpv 实时状态 |
| `search` | ~0.5s | 四源并发搜索 |

控制命令不加载音乐源模块，通过 lazy import 和 `timer.unref()` 实现极速响应。

## 音乐源

| 平台 | 搜索 | 播放 | 歌词 | 备注 |
|------|:----:|:----:|:----:|------|
| 酷我 | ✅ | ✅ | ✅ | 免费歌曲最多，推荐 |
| QQ音乐 | ✅ | ⚠️ | ✅ | 热门歌曲需 VIP |
| 酷狗 | ✅ | ⚠️ | ✅ | 热门歌曲需 VIP |
| 网易云 | ✅ | ⚠️ | ✅ | 部分歌曲有版权限制 |

`play` 命令内置智能换源：当一个源因 VIP 或版权限制无法播放时，自动尝试其他源。

## 架构

```
src/
  index.ts              # CLI 入口，lazy import
  commands/
    search.ts           # 搜索命令
    play.ts             # 播放命令（含智能换源）
    control.ts          # 暂停/恢复/停止/音量/快进（轻量，不加载 providers）
    status.ts           # 状态查询
    lyric.ts            # 歌词
    download.ts         # 下载
  providers/
    types.ts            # Song, MusicProvider 接口
    registry.ts         # Provider 注册表，并发搜索
    kuwo.ts             # 酷我（无加密）
    qq.ts               # QQ音乐（JSON 请求体 + GUID）
    kugou.ts            # 酷狗（MD5 签名）
    netease.ts          # 网易云（AES-CBC + RSA 加密）
  player/
    mpv.ts              # mpv IPC JSON 协议封装
    daemon.ts           # 后台播放状态管理
    lyrics.ts           # LRC 歌词解析
  ui/
    app.tsx             # TUI 根组件
    search-view.tsx     # 搜索界面
    results-view.tsx    # 结果列表
    player-view.tsx     # 播放界面（进度条 + 歌词）
  download/
    downloader.ts       # 流式下载
  utils/
    http.ts             # 带平台 Headers 的 HTTP 客户端
    format.ts           # 格式化工具
```

## 技术栈

- **TypeScript** + **tsup** 构建
- **commander** 命令行解析
- **ink** v6 + **React** 19 交互式 TUI
- **mpv** IPC JSON 协议（自封装，零依赖）
- **Node.js crypto** 音乐源加密（AES/RSA/MD5）

## License

MIT

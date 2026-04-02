# 音乐搜索与播放

当用户要求播放音乐、搜歌、听歌、放松一下时使用此 skill。

## 可用命令

### 播放（0.5s，后台播放，立即返回）
```bash
play-music play "歌名 歌手" --json
play-music play "歌名" --source kuwo --json  # 指定源：kuwo/qq/kugou/netease
```
自动搜索所有源，智能 fallback（VIP 歌曲自动换源）。

### 控制播放（<50ms，即时响应）
```bash
play-music pause      # 暂停
play-music resume     # 继续
play-music stop       # 停止
play-music volume 60  # 调音量 (0-100)
play-music seek +30   # 快进 30 秒
play-music seek -10   # 后退 10 秒
```

### 查看状态（<80ms）
```bash
play-music status --json
```

### 搜索
```bash
play-music search "关键词" --json --limit 5
```

### 歌词
```bash
play-music lyric --json
```

### 下载
```bash
play-music download "歌名" -o ~/Music --json
```

## 输出格式
所有命令统一 JSON: `{"ok": true/false, "data": ..., "error": ...}`

## 使用示例

用户说 "放首歌" / "来点音乐"：
```bash
play-music play "周杰伦 晴天" --json
```

用户说 "暂停" / "停"：
```bash
play-music pause
```

用户说 "现在放的什么"：
```bash
play-music status --json
```

## 注意
- 热门歌曲可能有版权限制，play 会自动尝试所有源直到找到可播放的
- 优先使用 kuwo 源（免费歌曲最多）
- 需要 mpv：`brew install mpv`

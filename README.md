# Ren'Py Scene Extractor

Desktop app to browse, preview, extract, queue, edit, and export media from Ren'Py game archives (`.rpa`) and loose media files.

## Important / Disclaimer

Use this tool only for lawful use:

- your own projects,
- projects you have permission to analyze/extract,
- or content that is explicitly allowed.

This repository **does not include any game assets**.
Do not upload extracted assets from third-party games to this repository.

---

## Highlights

- Scan Ren'Py game folders and list `.rpa` archives
- Supports **RPA-2.0**, **RPA-3.0**, and **RPA-3.2**
- Browse **loose media files** in the game folder
- Preview **video / image / audio** directly from archives or local files
- Multi-select files, queue playback, loop per item
- Timeline editor with:
  - trim
  - split
  - duplicate
  - reorder
  - close gaps for video/image
  - stacked audio tracks (`Audio 2`, `Audio 3`, etc.)
  - fullscreen preview
- Export the timeline into **one final MP4 video file**
- Bundled FFmpeg support for release builds

---

## Screenshots

### Main Interface
![Main Interface](img/main.png)

### Timeline Editor
![Timeline Editor](img/scene_editor.png)

---

## User Features

### Main Workspace

- Hideable/collapsible sidebar
- Archive/game list with remove button
- File browser with:
  - search
  - type filter (`All / Video / Image / Audio`)
  - list/grid mode
- Selection tray for:
  - **Queue Selected**
  - **Extract Selected**
  - **Extract All**
  - **Help**

### Preview Panel

- Custom preview player
- Previous/next scene controls
- Fullscreen preview support
- Auto-play next
- Queue-aware playback
- Overlay play/pause auto-hide

### Play Queue

- Reorder by drag
- Loop count per item
- Play all queue items
- Open queue in timeline editor

### Timeline Editor

- Separate `Video` track + dynamic audio tracks
- Drag clips on the timeline
- Drag edge handles to trim
- Split at playhead
- Duplicate selected clip
- Reorder clips earlier/later
- Close gaps for video/image only
- Audio clips can overlap by moving them to lower audio tracks
- Selected Clip section is collapsible
- Preview area supports resize + fullscreen
- Timeline draft persists when leaving/re-entering editor

---

## Supported Preview Types

### Video

- `webm`
- `mp4`
- `mkv`
- `avi`
- `ogv`
- `mov`
- `flv`

### Image

- `png`
- `jpg`
- `jpeg`
- `gif`
- `bmp`
- `webp`
- `tga`

### Audio

- `mp3`
- `wav`
- `ogg`
- `flac`
- `aac`
- `opus`

> If audio exists in the game but does not appear in the Audio filter, it likely uses a format/extension not listed above.

---

## Keyboard Shortcuts

### Main App

| Key | Action |
|-----|--------|
| `↑ / ↓ / ← / →` | Navigate files or queue based on current nav target |
| `A / D` | Prev / next scene in custom preview |
| `Q` | Import selected files to play queue |
| `?` | Toggle help guide |
| `Ctrl+Click` | Toggle multi-select |
| `Shift+Click` | Range select |

### Timeline Editor

| Key | Action |
|-----|--------|
| `Space` | Play / pause |
| `S` | Split at playhead |
| `D` | Duplicate selected clip |
| `Alt+← / →` | Reorder selected clip |
| `Delete` | Delete selected clip |

---

## Encryption Keys

Some Ren'Py archives are encrypted.
If an archive fails to open (e.g. zlib / pickle error), you may need to enter a **hex key**.

Use only keys you are authorized to use.

---

## Build / Run

## Requirements

- Node.js
- npm
- Python 3 available in PATH as `python`

### Install dependencies

```bash
npm install
```

### Run dev mode

```bash
npm run dev
```

### Build app bundles

```bash
npm run build
```

### Build Windows installer

```bash
npm run dist
```

Output:

```text
release/1.0.0/
```

Windows installer name:

```text
RenPy Scene Extractor-Windows-1.0.0-Setup.exe
```

---

## FFmpeg for Export

For release builds, this project now supports **bundled FFmpeg essentials**.

Place FFmpeg files at:

```text
vendor/ffmpeg/bin/ffmpeg.exe
vendor/ffmpeg/bin/ffprobe.exe
```

The builder will bundle them to:

```text
resources/ffmpeg/bin/
```

At runtime:

1. the app will look for bundled FFmpeg first
2. if not found, the app falls back to `PATH`

---

## Export Notes

- Exporting the timeline produces **one final MP4 file**, not separate files.
- The export backend requires FFmpeg.
- If FFmpeg is not found, the app will show a clear error.

---

## Temp File Behavior

Preview/editor extraction now uses a **session temp directory**, not the old shared temp folder that kept growing.

- preview temp is created under `%TEMP%/rpa-extractor/session-*`
- active sessions are cleaned up on normal app quit
- startup runs a janitor cleanup for stale orphan sessions

---

## Troubleshooting

### Audio exists in the game but does not appear in the Audio filter

Possible reasons:

- the audio file is in another archive that hasn't been opened yet,
- the file is loose media but hasn't been scanned in the selected folder,
- or the audio format is not yet included in the supported list.

### Video / audio preview has no sound or does not play

Some media formats are not fully compatible with the Chromium/Electron player.
If a file plays in VLC but not in the app, it is usually a codec/pixel format compatibility issue.

### Export fails because FFmpeg is not found

Make sure one of these conditions is met:

- Bundled FFmpeg exists at `vendor/ffmpeg/bin/` before build, or
- `ffmpeg` and `ffprobe` are available in `PATH`

### Python not found

Make sure `python` can be invoked from terminal:

```bash
python --version
```

---

## License

MIT License

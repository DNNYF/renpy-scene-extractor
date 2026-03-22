# Ren'Py Scene Extractor

A desktop application for browsing, previewing, and extracting media files from Ren'Py game archives (`.rpa`). It supports video/image/audio preview and includes a simple timeline editor for arranging clips.

## Important / Disclaimer (Read This)

This project is provided for **legitimate use only** (e.g., your own projects, projects you have permission to analyze, or content that is licensed for extraction).

- **Do not** use this tool to extract, redistribute, or share copyrighted assets from games you do not have the rights to.
- This repository **does not include any game assets**.  
  Please **do not upload** extracted content (videos, images, audio, scripts, `.rpa`, `.rpyc`, etc.) into this repository.

---

## For Users (Normal Use)

### Requirements
- Windows 10/11
- Python 3.x installed and available in PATH

### Option A — Install & Run (Recommended)
1. Download the latest **Windows installer (.exe)** from the Releases page.
2. Run the installer.
3. Open the app and select a Ren'Py game folder.

### Option B — No Install (Run Dev Only / Portable-ish)
If you **don’t want to install** the app, you can run it directly from source in **development mode** (see **Developer Setup** below).  
This runs the app without creating an installer.

---

## For Developers

### Tech Stack
- Electron + Vite + React + TypeScript
- Python backend for RPA scanning/listing/extraction

### Prerequisites
- Node.js (recommended: Node 20+)
- npm
- Python 3.x available as `python` in your terminal (Windows: ensure Python is added to PATH)

### Install Dependencies
```bash
npm ci
```

### Run in Dev Mode (No Installer)
This is the easiest way to use the app **without installing** anything system-wide.

```bash
npm run dev
```

> Notes:
> - The Electron window is started by the Vite/Electron dev setup.
> - Python is invoked via `python` command. If your system uses `py` instead, you may need to adjust the Electron spawn command.

### Build (Web + Electron dist files)
```bash
npm run build
```

### Package Windows Installer
```bash
npx electron-builder --win --publish never
```

Output will be placed under:
- `release/<version>/...`

---

## Features
- Browse and extract files from RPA-2.0, RPA-3.0, and RPA-3.2 archives
- Preview videos, images, and audio directly from archives
- Support for encrypted archives (hex key input)
- Play queue with loop count per item
- Timeline editor for arranging media clips
- Batch extraction with type filtering

---

## Encrypted Archives (Keys)
Some Ren'Py archives are encrypted. If an archive fails to open (e.g., zlib/pickle errors), you may need to provide the encryption key.

**Only use encryption keys you are authorized to use. Do not share keys from third-party games.**

---

## License
MIT License

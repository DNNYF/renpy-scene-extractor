Place the FFmpeg essentials build here before running `npm run dist`.

Expected structure:

vendor/
  ffmpeg/
    bin/
      ffmpeg.exe
      ffprobe.exe

The Electron build will bundle this folder into:

resources/ffmpeg/bin/

At runtime the app prefers bundled binaries from resources/ffmpeg/bin and falls back to PATH for development.

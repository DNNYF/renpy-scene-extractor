export type TimelineMediaType = 'video' | 'image' | 'audio' | 'other'

export const TIMELINE_TRACK_LABEL_WIDTH = 100

export function buildLocalFileUrl(filePath: string): string {
  return `local-file://${encodeURIComponent(filePath.replace(/\\/g, '/'))}`
}

export function measureMediaSourceDuration(
  filePath: string,
  fileType: TimelineMediaType,
): Promise<number | undefined> {
  if (fileType !== 'video' && fileType !== 'audio') {
    return Promise.resolve(undefined)
  }

  return new Promise((resolve) => {
    const media = document.createElement(fileType)
    let settled = false

    const finish = (duration?: number) => {
      if (settled) return
      settled = true
      media.pause()
      media.removeAttribute('src')
      media.load()
      resolve(duration)
    }

    const onLoadedMetadata = () => {
      const duration = media.duration
      if (Number.isFinite(duration) && duration > 0) {
        finish(duration)
      } else {
        finish(undefined)
      }
    }

    const onError = () => finish(undefined)

    media.preload = 'metadata'
    media.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })
    media.addEventListener('error', onError, { once: true })
    media.src = buildLocalFileUrl(filePath)

    window.setTimeout(() => finish(undefined), 8000)
  })
}

const IMAGE_SEQUENCE_FRAME_DURATION = 0.05
const MIN_SEQUENCE_LENGTH = 3

type SequenceCandidate = {
  directory: string
  prefix: string
  extension: string
  frameNumber: number
  digitCount: number
}

export type ImageSequenceEntry = {
  sequenceId: string
  frameIndex: number
  frameCount: number
  frameDuration: number
}

type SequenceLikeItem = {
  path: string
  name: string
  type: 'video' | 'image' | 'audio' | 'other'
}

function normalizePathSeparators(value: string): string {
  return value.replace(/\\/g, '/')
}

function parseImageSequenceCandidate(fileName: string): SequenceCandidate | null {
  const normalizedPath = normalizePathSeparators(fileName)
  const segments = normalizedPath.split('/').filter(Boolean)
  const lastSegment = segments.at(-1)
  if (!lastSegment) {
    return null
  }

  const extensionMatch = lastSegment.match(/^(.*?)(\.[^.]+)$/)
  if (!extensionMatch) {
    return null
  }

  const [, stem, extension] = extensionMatch
  const frameMatch = stem.match(/^(.*?)(\d+)$/)
  if (!frameMatch) {
    return null
  }

  const [, rawPrefix, digits] = frameMatch
  const frameNumber = Number.parseInt(digits, 10)

  if (!Number.isFinite(frameNumber)) {
    return null
  }

  return {
    directory: segments.slice(0, -1).join('/').toLowerCase(),
    prefix: rawPrefix.toLowerCase(),
    extension: extension.toLowerCase(),
    frameNumber,
    digitCount: digits.length,
  }
}

function isSameSequenceCandidate(left: SequenceCandidate, right: SequenceCandidate): boolean {
  return left.directory === right.directory
    && left.prefix === right.prefix
    && left.extension === right.extension
    && left.digitCount === right.digitCount
}

export function buildImageSequenceMap(items: SequenceLikeItem[]): Map<string, ImageSequenceEntry> {
  const sequenceMap = new Map<string, ImageSequenceEntry>()

  let runStart = 0
  while (runStart < items.length) {
    const startItem = items[runStart]
    const startCandidate = startItem.type === 'image'
      ? parseImageSequenceCandidate(startItem.name)
      : null

    if (!startCandidate) {
      runStart += 1
      continue
    }

    let runEnd = runStart + 1
    let previousCandidate = startCandidate

    while (runEnd < items.length) {
      const nextItem = items[runEnd]
      if (nextItem.type !== 'image') {
        break
      }

      const nextCandidate = parseImageSequenceCandidate(nextItem.name)
      if (!nextCandidate || !isSameSequenceCandidate(previousCandidate, nextCandidate)) {
        break
      }

      if (nextCandidate.frameNumber !== previousCandidate.frameNumber + 1) {
        break
      }

      previousCandidate = nextCandidate
      runEnd += 1
    }

    const runLength = runEnd - runStart
    if (runLength >= MIN_SEQUENCE_LENGTH) {
      const sequenceId = `${startCandidate.directory}:${startCandidate.prefix}:${startCandidate.extension}:${startCandidate.digitCount}:${startCandidate.frameNumber}`
      for (let index = runStart; index < runEnd; index += 1) {
        sequenceMap.set(items[index].path, {
          sequenceId,
          frameIndex: index - runStart,
          frameCount: runLength,
          frameDuration: IMAGE_SEQUENCE_FRAME_DURATION,
        })
      }
    }

    runStart = runEnd > runStart + 1 ? runEnd : runStart + 1
  }

  return sequenceMap
}

export { IMAGE_SEQUENCE_FRAME_DURATION }

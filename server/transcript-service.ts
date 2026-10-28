import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ApiError, type Cue } from '@shared/types'
import { runOrThrow, type RunYtDlp } from './yt-dlp.ts'

/** 語言代碼只允許英數與 -，且不能以 - 開頭，避免被 yt-dlp 當成選項或正規表示式 */
const TRACK_ID = /^(manual|auto):([A-Za-z0-9][A-Za-z0-9-]*)$/

/** json3 中用到的欄位 */
interface Json3 {
  events?: { tStartMs?: number; segs?: { utf8?: string }[] }[]
}

export async function getTranscript(
  runYtDlp: RunYtDlp,
  url: string,
  trackId: string | null,
): Promise<Cue[]> {
  const match = TRACK_ID.exec(trackId ?? '')
  if (!match) throw noSuchTrack()
  const [, kind, language] = match

  const dir = await mkdtemp(join(tmpdir(), 'youtube-transcript-viewer-'))
  try {
    await runOrThrow(runYtDlp, [
      '--skip-download',
      '--no-playlist',
      kind === 'manual' ? '--write-subs' : '--write-auto-subs',
      '--sub-langs',
      language,
      '--sub-format',
      'json3',
      '-P',
      dir,
      '-o',
      'subtitle',
      '--',
      url,
    ])
    const file = (await readdir(dir)).find((name) => name.endsWith('.json3'))
    if (!file) throw noSuchTrack()
    return parseJson3(JSON.parse(await readFile(join(dir, file), 'utf8')) as Json3)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** 每個事件成為一段字幕；略過沒有 segs 或只有空白的事件（例如自動字幕的 aAppend 換行） */
function parseJson3(json: Json3): Cue[] {
  return (json.events ?? []).flatMap((event) => {
    const text = (event.segs ?? [])
      .map((seg) => seg.utf8 ?? '')
      .join('')
      .replace(/\s*\n\s*/g, ' ')
      .trim()
    return text ? [{ startMs: event.tStartMs ?? 0, text }] : []
  })
}

function noSuchTrack() {
  return new ApiError('INVALID_TRACK', '找不到這個字幕軌，請重新選擇')
}

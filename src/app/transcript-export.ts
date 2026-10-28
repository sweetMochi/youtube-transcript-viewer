import type { Cue, TrackKind } from '@shared/types'
import type { LineOptions } from './app.type'

/** 檔案標題字數上限 */
const MAX_TITLE_LENGTH = 150

/** 字幕對應的標籤 */
export const TRACK_KIND_LABEL: { [key in TrackKind]: string } = {
  manual: '人工字幕',
  auto: '自動字幕',
}

/** 畫面、複製與下載共用的逐字稿行 */
export function transcriptLines(cues: Cue[], options: LineOptions): string[] {
  if (!options.includeTimestamps) return cues.map((cue) => cue.text)
  const lengthSeconds = options.durationSeconds ?? (cues.at(-1)?.startMs ?? 0) / 1000
  const withHours = lengthSeconds >= 3600
  return cues.map((cue) => `[${formatTimestamp(cue.startMs, withHours)}] ${cue.text}`)
}

/**
 * 將毫秒轉成時間戳字串
 * @param ms 毫秒
 * @param withHours 是否包含小時
 */
function formatTimestamp(ms: number, withHours: boolean) {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor(totalSeconds / 60) % 60
  const seconds = totalSeconds % 60
  const parts = withHours ? [hours, minutes, seconds] : [minutes, seconds]
  return parts.map((n) => String(n).padStart(2, '0')).join(':')
}

/**
 * 「複製全部」的內容：只有字幕，不含檔頭
 * @param cues 字幕片段
 * @param options 單行選項
 */
export function copyText(cues: Cue[], options: LineOptions): string {
  return transcriptLines(cues, options).join('\n')
}

/**
 * 輸出 txt 需要的影片與字幕軌資訊
 */
export interface TranscriptSource {
  /** 影片 ID */
  videoId: string
  /** 影片標題 */
  title: string
  /** 影片網址 */
  webpageUrl: string
  /** 影片長度（秒），若無法取得則為 null */
  durationSeconds: number | null
  /** 字幕軌資訊 */
  track: {
    /** 語言代碼 */
    language: string
    /** 字幕種類 */
    kind: TrackKind
  }
}

/**
 * 字幕軌選單需要的字幕軌資訊
 */
export interface TrackOption {
  id: string
  /** 語言代碼 */
  language: string
  /** 語言名稱 */
  languageName: string
  /** 字幕種類 */
  kind: TrackKind
}

/**
 * 字幕軌選單的選項文字（以 track id 對應）：「<語言名稱>・<種類>」，與其他字幕軌相同時才在語言名稱後補上（<語言代碼>）
 * @param tracks 字幕軌選單的選項
 */
export function trackOptionLabels(tracks: TrackOption[]): { [key: string]: string } {
  const plain = tracks.map((track) => `${track.languageName}・${TRACK_KIND_LABEL[track.kind]}`)
  return Object.fromEntries(
    tracks.map((track, i) => {
      const duplicated = plain.indexOf(plain[i]) !== plain.lastIndexOf(plain[i])
      const label = duplicated
        ? `${track.languageName}（${track.language}）・${TRACK_KIND_LABEL[track.kind]}`
        : plain[i]
      return [track.id, label]
    }),
  )
}

/**
 * txt 檔內容：標題、網址、字幕軌三行檔頭，空一行後接字幕；LF 換行
 * @param source 影片與字幕軌資訊
 * @param cues 字幕片段
 * @param includeTimestamps 是否包含時間戳
 */
export function txtContent(source: TranscriptSource, cues: Cue[], includeTimestamps: boolean) {
  const header = [
    source.title,
    source.webpageUrl,
    `${source.track.language}・${TRACK_KIND_LABEL[source.track.kind]}`,
  ]
  const lines = transcriptLines(cues, {
    durationSeconds: source.durationSeconds,
    includeTimestamps,
  })
  return [...header, '', ...lines, ''].join('\n')
}

/**
 * `<標題> [<videoId>].<語言>.txt`，標題中 Windows 不允許的字元與控制字元換成 _
 * @param source 影片與字幕軌資訊
 */
export function txtFileName(source: TranscriptSource) {
  const safe = source.title.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_')
  const title = Array.from(safe)
    .slice(0, MAX_TITLE_LENGTH)
    .join('')
    .replace(/[\s.]+$/, '')
  return `${title} [${source.videoId}].${source.track.language}.txt`
}

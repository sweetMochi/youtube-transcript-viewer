import type { Track, TrackKind, VideoInfo } from '@shared/types'
import { runOrThrow, type RunYtDlp } from './yt-dlp.ts'

const PREFERRED_LANGUAGES = ['zh-TW', 'zh-Hant', 'zh', 'en']

/** yt-dlp `-J` 輸出中，每個字幕軌底下的一種格式 */
interface YtDlpSubtitleFormat {
  ext: string
  url: string
  name?: string
}

type YtDlpSubtitles = Record<string, YtDlpSubtitleFormat[]>

/** yt-dlp `-J` 輸出中用到的欄位 */
interface YtDlpVideoJson {
  id: string
  title: string
  webpage_url: string
  duration?: number | null
  subtitles?: YtDlpSubtitles
  automatic_captions?: YtDlpSubtitles
}

export async function getVideoInfo(runYtDlp: RunYtDlp, url: string): Promise<VideoInfo> {
  const { stdout } = await runOrThrow(runYtDlp, [
    '-J',
    '--skip-download',
    '--no-playlist',
    '--',
    url,
  ])
  const json = JSON.parse(stdout) as YtDlpVideoJson
  const tracks = [
    ...toTracks('manual', json.subtitles ?? {}),
    ...toTracks('auto', withoutTranslations(json.automatic_captions ?? {})),
  ]
  return {
    videoId: json.id,
    title: json.title,
    webpageUrl: json.webpage_url,
    durationSeconds: json.duration ?? null,
    tracks,
    defaultTrackId: pickDefaultTrack(tracks)?.id ?? null,
  }
}

/** 人工字幕優先；同種類中依偏好語言，沒有偏好語言時取第一軌 */
function pickDefaultTrack(tracks: Track[]): Track | undefined {
  for (const kind of ['manual', 'auto'] as const) {
    const ofKind = tracks.filter((track) => track.kind === kind)
    for (const preferred of PREFERRED_LANGUAGES) {
      const match = ofKind.find((track) => matchesLanguage(track.language, preferred))
      if (match) return match
    }
    if (ofKind.length > 0) return ofKind[0]
  }
  return undefined
}

/** `en` 符合 `en`、`en-GB`、`en-ehkg1hFWq8A`，不分大小寫 */
function matchesLanguage(language: string, preferred: string) {
  const lower = language.toLowerCase()
  const target = preferred.toLowerCase()
  return lower === target || lower.startsWith(`${target}-`)
}

/** 只列出有 json3 格式的字幕軌 */
function toTracks(kind: TrackKind, subtitles: YtDlpSubtitles): Track[] {
  return Object.entries(subtitles).flatMap(([language, formats]) => {
    const json3 = formats.find((format) => format.ext === 'json3')
    return json3
      ? [{ id: `${kind}:${language}`, language, languageName: json3.name ?? language, kind }]
      : []
  })
}

/**
 * 排除自動翻譯軌：翻譯軌的 json3 網址帶有 `tlang` 參數
 * 原始語音辨識軌會同時以 `en` 與 `en-orig` 出現，兩者都在時只保留 `en`
 */
function withoutTranslations(captions: YtDlpSubtitles): YtDlpSubtitles {
  const original = Object.entries(captions).filter(([, formats]) => {
    const json3 = formats.find((format) => format.ext === 'json3')
    return json3 && !new URL(json3.url).searchParams.has('tlang')
  })
  const languages = new Set(original.map(([language]) => language))
  return Object.fromEntries(
    original.filter(
      ([language]) =>
        !(language.endsWith('-orig') && languages.has(language.slice(0, -'-orig'.length))),
    ),
  )
}

/**
 * 字幕軌種類
 */
export type TrackKind = 'manual' | 'auto'

/**
 * 字幕軌資訊
 */
export interface Track {
  id: string
  /** 語言代碼，例如 zh-TW */
  language: string
  /** 語言名稱 */
  languageName: string
  /** 字幕軌種類 */
  kind: TrackKind
}

/**
 * 單行字幕
 */
export interface Cue {
  /** 起始時間（毫秒） */
  startMs: number
  /** 字幕文字 */
  text: string
}

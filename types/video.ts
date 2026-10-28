import type { Track } from './track.ts'

/**
 * 影片資訊
 */
export interface VideoInfo {
  /** 影片 ID */
  videoId: string
  /** 影片標題 */
  title: string
  /** 影片網頁 URL */
  webpageUrl: string
  /** 影片長度（秒），若無法取得則為 null */
  durationSeconds: number | null
  /** 可用的字幕軌 */
  tracks: Track[]
  /** 沒有任何字幕軌時為 null */
  defaultTrackId: string | null
}

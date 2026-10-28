/**
 * 表示目前的載入狀態
 */
export type Loading = 'video' | 'transcript' | null

/**
 * 逐字稿行選項
 */
export interface LineOptions {
  /** 影片長度，可能為空值 */
  durationSeconds: number | null
  /** 是否包含時間戳 */
  includeTimestamps: boolean
}

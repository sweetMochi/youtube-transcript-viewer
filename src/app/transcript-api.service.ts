import { Injectable } from '@angular/core'
import { ApiError, ApiErrorBody, STATUS, type Cue, type VideoInfo } from '@shared/types'

/**
 * 本地 API 的用戶端
 */
@Injectable({ providedIn: 'root' })
export class TranscriptApi {
  getVideo(url: string) {
    return getJson<VideoInfo>('/api/video', { url })
  }

  async getTranscript(url: string, trackId: string) {
    const { cues } = await getJson<{ cues: Cue[] }>('/api/transcript', {
      url,
      track: trackId,
    })
    return cues
  }
}

/**
 * 非 2xx 時，取出後端的錯誤訊息；body 不是預期格式就當作連線問題
 * @param path API 路徑
 * @param params 查詢參數
 */
async function getJson<T>(path: string, params: { [key: string]: string }): Promise<T> {
  const res = await fetch(`${path}?${new URLSearchParams(params)}`)

  // 如果 HTTP 狀態碼是 2xx，直接回傳 JSON
  if (res.ok) return res.json()

  const body = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null

  const error = body?.error

  // 如果後端回傳的 body 包含錯誤資訊，且格式正確
  if (error && error.code in STATUS && typeof error.message === 'string') {
    throw new ApiError(error.code, error.message)
  }

  throw new Error(`HTTP ${res.status}`)
}

/** 取出後端回傳的繁中錯誤訊息；連不到後端時，提示啟動方式 */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  return '無法連線到本地 API，請確認已用 npm start 啟動'
}

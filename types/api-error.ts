export type ApiErrorCode =
  | 'INVALID_URL'
  | 'INVALID_TRACK'
  | 'LOGIN_REQUIRED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'YTDLP_FAILED'
  | 'INTERNAL'

/** HTTP 狀態碼對應表 */
export const STATUS: Record<ApiErrorCode, number> = {
  INVALID_URL: 400,
  INVALID_TRACK: 400,
  LOGIN_REQUIRED: 403,
  NOT_FOUND: 404,
  INTERNAL: 500,
  YTDLP_FAILED: 502,
  // 限流的是上游 YouTube，不是本地 API，所以用 503 而不是 429
  RATE_LIMITED: 503,
}

/**
 * 後端回應錯誤內容
 */
export interface ApiErrorBody {
  error: {
    /** 錯誤代碼 */
    code: ApiErrorCode
    /** 錯誤訊息 */
    message: string
  }
}

/**
 * 回傳給前端的錯誤
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number

  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.code = code
    this.status = STATUS[code]
  }
}

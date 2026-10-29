import { execFile } from 'node:child_process'
import { ApiError } from '@shared/types'

export interface YtDlpResult {
  stdout: string
  stderr: string
  exitCode: number
}

/** 以參數陣列執行 yt-dlp；測試時替換成假的實作 */
export type RunYtDlp = (args: string[]) => Promise<YtDlpResult>

/** 正式使用的執行器：直接執行 yt-dlp.exe，不經過 shell */
export const runYtDlp: RunYtDlp = (args) =>
  new Promise((resolve, reject) => {
    execFile(
      'yt-dlp',
      args,
      { maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') return reject(error)
        resolve({ stdout, stderr, exitCode: typeof error?.code === 'number' ? error.code : 0 })
      },
    )
  })

/** 執行 yt-dlp，失敗時依 stderr 轉成對應的 ApiError */
export async function runOrThrow(run: RunYtDlp, args: string[]): Promise<YtDlpResult> {
  let result: YtDlpResult
  try {
    result = await run(args)
  } catch (error) {
    console.error(error)
    throw new ApiError('YTDLP_FAILED', '無法執行 yt-dlp，請確認已安裝並在 PATH 中')
  }
  if (result.exitCode !== 0) throw toApiError(result.stderr)
  return result
}

function toApiError(stderr: string) {
  // 429 太多請求與機器人驗證都是 YouTube 對這個 IP 限流；機器人驗證也含 sign in，必須先於登入判斷
  if (/HTTP Error 429|Too Many Requests|not a bot/i.test(stderr)) {
    return new ApiError('RATE_LIMITED', 'YouTube 暫時限制了請求次數，請稍候幾分鐘再試')
  }
  // 403 YouTube 回傳的原因含有 sign in 時，yt-dlp 會接上 --cookies 的登入提示
  if (/sign in|--cookies|members-only/i.test(stderr)) {
    return new ApiError('LOGIN_REQUIRED', '這支影片需要登入才能存取，目前不支援')
  }
  // 404 影片不存在或已被刪除
  if (/video (is )?unavailable|has been removed|does not exist/i.test(stderr)) {
    return new ApiError('NOT_FOUND', '找不到這支影片，可能已被刪除或網址有誤')
  }
  // 網址被截斷（videoId 不足 11 碼）是使用者複製不完整，與 yt-dlp 版本無關
  if (/Incomplete YouTube ID|looks truncated/i.test(stderr)) {
    return new ApiError('INVALID_URL', '影片網址不完整，請確認是否完整複製網址')
  }
  console.error(stderr)
  return new ApiError(
    'YTDLP_FAILED',
    'yt-dlp 執行失敗，可能是 YouTube 有所變動，請嘗試更新 yt-dlp 後再試',
  )
}

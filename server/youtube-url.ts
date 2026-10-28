import { ApiError } from '@shared/types'

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'])

/**
 * 確認輸入是 YouTube 的 http(s) 網址，只檢查網域，不解析 videoId
 * 回傳正規化後的網址字串，交給 yt-dlp 使用
 */
export function assertYouTubeUrl(input: string | null): string {
  let url: URL
  try {
    url = new URL(input ?? '')
  } catch {
    throw invalidUrl()
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !YOUTUBE_HOSTS.has(url.hostname)) {
    throw invalidUrl()
  }
  return url.href
}

function invalidUrl() {
  return new ApiError(
    'INVALID_URL',
    '請輸入 YouTube 影片網址，例如 https://www.youtube.com/watch?v=...',
  )
}

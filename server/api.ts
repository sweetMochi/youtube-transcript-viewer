import { createServer, type ServerResponse } from 'node:http'
import { ApiError } from '@shared/types'
import { getTranscript } from './transcript-service.ts'
import { getVideoInfo } from './video-service.ts'
import type { RunYtDlp } from './yt-dlp.ts'
import { assertYouTubeUrl } from './youtube-url.ts'

export type { RunYtDlp } from './yt-dlp.ts'

export function createApiServer(runYtDlp: RunYtDlp) {
  return createServer(async (req, res) => {
    try {
      const { pathname, searchParams } = new URL(req.url ?? '/', 'http://localhost')
      if (req.method === 'GET' && pathname === '/api/video') {
        const url = assertYouTubeUrl(searchParams.get('url'))
        return sendJson(res, 200, await getVideoInfo(runYtDlp, url))
      }
      if (req.method === 'GET' && pathname === '/api/transcript') {
        const url = assertYouTubeUrl(searchParams.get('url'))
        const cues = await getTranscript(runYtDlp, url, searchParams.get('track'))
        return sendJson(res, 200, { cues })
      }
      sendJson(res, 404, { error: { code: 'NOT_FOUND', message: '找不到這個 API' } })
    } catch (error) {
      if (error instanceof ApiError) {
        sendJson(res, error.status, { error: { code: error.code, message: error.message } })
      } else {
        console.error(error)
        sendJson(res, 500, { error: { code: 'INTERNAL', message: '本地 API 發生未預期的錯誤' } })
      }
    }
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

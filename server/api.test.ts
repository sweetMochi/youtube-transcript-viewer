import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test, type TestContext } from 'node:test'
import type { AddressInfo } from 'node:net'
import { createApiServer, type RunYtDlp } from './api.ts'

/** 啟動 API 並在測試結束時關閉；回傳發送請求的函式與 yt-dlp 的呼叫紀錄 */
async function startApi(t: TestContext, runYtDlp: RunYtDlp) {
  const calls: string[][] = []
  const server = createApiServer(async (args) => {
    calls.push(args)
    return runYtDlp(args)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const { port } = server.address() as AddressInfo
  const get = async (path: string) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(3000),
    })
    return { status: res.status, body: await res.json() }
  }
  return { get, calls }
}

const neverCalled: RunYtDlp = async () => {
  throw new Error('不應呼叫 yt-dlp')
}

function fixture(name: string) {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
}

/** 假的 yt-dlp：`-J` 時印出影片資訊 JSON */
function printsVideoInfo(fixtureName: string): RunYtDlp {
  return async () => ({ stdout: fixture(fixtureName), stderr: '', exitCode: 0 })
}

function videoPath(url: string) {
  return `/api/video?url=${encodeURIComponent(url)}`
}

describe('GET /api/video：網址驗證', () => {
  for (const [label, url] of [
    ['非 YouTube 網域', 'https://example.com/watch?v=dQw4w9WgXcQ'],
    ['偽裝成 YouTube 的網域', 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'],
    ['非 http(s) 協定', 'file:///C:/Windows/win.ini'],
    ['以 - 開頭的選項', '--exec=calc'],
    ['不是網址', 'dQw4w9WgXcQ'],
    ['空字串', ''],
  ]) {
    test(`${label}：回傳 400 INVALID_URL，且不呼叫 yt-dlp`, async (t) => {
      const api = await startApi(t, neverCalled)
      const { status, body } = await api.get(videoPath(url))
      assert.equal(status, 400)
      assert.equal(body.error.code, 'INVALID_URL')
      assert.equal(typeof body.error.message, 'string')
      assert.deepEqual(api.calls, [])
    })
  }

  test('缺少 url 參數：回傳 400 INVALID_URL', async (t) => {
    const api = await startApi(t, neverCalled)
    const { status, body } = await api.get('/api/video')
    assert.equal(status, 400)
    assert.equal(body.error.code, 'INVALID_URL')
  })
})

describe('GET /api/video：影片資訊', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL0000000000',
  ]) {
    test(`${url}：以 -- 隔開網址、加上 --no-playlist 呼叫 yt-dlp`, async (t) => {
      const api = await startApi(t, printsVideoInfo('video-manual-and-auto.json'))
      const { status } = await api.get(videoPath(url))
      assert.equal(status, 200)
      assert.deepEqual(api.calls, [['-J', '--skip-download', '--no-playlist', '--', url]])
    })
  }

  test('回傳 yt-dlp 提供的 videoId、標題、網址與長度', async (t) => {
    const api = await startApi(t, printsVideoInfo('video-manual-and-auto.json'))
    const { body } = await api.get(videoPath('https://youtu.be/dQw4w9WgXcQ'))
    assert.equal(body.videoId, 'dQw4w9WgXcQ')
    assert.equal(body.title, 'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)')
    assert.equal(body.webpageUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    assert.equal(body.durationSeconds, 213)
  })
})

describe('GET /api/video：字幕軌清單', () => {
  test('列出人工字幕與自動字幕，排除自動翻譯軌與沒有 json3 的軌', async (t) => {
    const api = await startApi(t, printsVideoInfo('video-manual-and-auto.json'))
    const { body } = await api.get(videoPath('https://youtu.be/dQw4w9WgXcQ'))
    assert.deepEqual(body.tracks, [
      { id: 'manual:en', language: 'en', languageName: 'English', kind: 'manual' },
      { id: 'manual:de-DE', language: 'de-DE', languageName: 'German (Germany)', kind: 'manual' },
      { id: 'manual:ja', language: 'ja', languageName: 'Japanese', kind: 'manual' },
      {
        id: 'manual:pt-BR',
        language: 'pt-BR',
        languageName: 'Portuguese (Brazil)',
        kind: 'manual',
      },
      {
        id: 'manual:es-419',
        language: 'es-419',
        languageName: 'Spanish (Latin America)',
        kind: 'manual',
      },
      { id: 'auto:en', language: 'en', languageName: 'English', kind: 'auto' },
    ])
  })

  test('只有自動字幕：en 與 en-orig 是同一軌，只保留 en', async (t) => {
    const api = await startApi(t, printsVideoInfo('video-auto-only.json'))
    const { body } = await api.get(videoPath('https://youtu.be/J---aiyznGQ'))
    assert.deepEqual(body.tracks, [
      { id: 'auto:en', language: 'en', languageName: 'English', kind: 'auto' },
    ])
  })
})

/** 組出只含字幕資訊的 yt-dlp `-J` 輸出；`translated` 表示網址帶有 tlang 的自動翻譯軌 */
function videoInfoWith(tracks: {
  manual?: readonly string[]
  auto?: readonly string[]
  translated?: readonly string[]
}): RunYtDlp {
  const entry = (language: string, query: string) => [
    {
      ext: 'json3',
      url: `https://www.youtube.com/api/timedtext?${query}&fmt=json3`,
      name: language,
    },
  ]
  const json = {
    id: 'AAAAAAAAAAA',
    title: '測試影片',
    webpage_url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA',
    duration: 60,
    subtitles: Object.fromEntries((tracks.manual ?? []).map((l) => [l, entry(l, `lang=${l}`)])),
    automatic_captions: Object.fromEntries([
      ...(tracks.auto ?? []).map((l) => [l, entry(l, `kind=asr&lang=${l}`)]),
      ...(tracks.translated ?? []).map((l) => [l, entry(l, `kind=asr&lang=en&tlang=${l}`)]),
    ]),
  }
  return async () => ({ stdout: JSON.stringify(json), stderr: '', exitCode: 0 })
}

describe('GET /api/video：預設字幕軌', () => {
  test('真實影片：人工 en 優先於自動 en', async (t) => {
    const api = await startApi(t, printsVideoInfo('video-manual-and-auto.json'))
    const { body } = await api.get(videoPath('https://youtu.be/dQw4w9WgXcQ'))
    assert.equal(body.defaultTrackId, 'manual:en')
  })

  test('真實影片：人工字幕的 key 帶有後綴（en-ehkg1hFWq8A）時，仍符合 en', async (t) => {
    const api = await startApi(t, printsVideoInfo('video-long.json'))
    const { body } = await api.get(videoPath('https://youtu.be/L_Guz73e6fw'))
    assert.equal(body.defaultTrackId, 'manual:en-ehkg1hFWq8A')
  })

  test('真實影片：只有自動字幕時選自動 en', async (t) => {
    const api = await startApi(t, printsVideoInfo('video-auto-only.json'))
    const { body } = await api.get(videoPath('https://youtu.be/J---aiyznGQ'))
    assert.equal(body.defaultTrackId, 'auto:en')
  })

  for (const [label, tracks, expected] of [
    ['人工字幕依 zh-TW 優先', { manual: ['en', 'zh-Hant', 'zh-TW'] }, 'manual:zh-TW'],
    ['沒有 zh-TW 時選 zh-Hant', { manual: ['en', 'zh-Hant'] }, 'manual:zh-Hant'],
    ['沒有 zh-TW、zh-Hant 時，zh 開頭的語言優先於 en', { manual: ['en', 'zh-CN'] }, 'manual:zh-CN'],
    ['語言比對不分大小寫', { manual: ['en', 'zh-tw'] }, 'manual:zh-tw'],
    [
      '任何語言的人工字幕都優先於偏好語言的自動字幕',
      { manual: ['ja', 'ko'], auto: ['zh-TW'] },
      'manual:ja',
    ],
    ['沒有人工字幕時，自動字幕依同樣的語言順序', { auto: ['ja', 'zh-TW'] }, 'auto:zh-TW'],
    ['沒有偏好語言時選第一個自動字幕', { auto: ['ja', 'ko'] }, 'auto:ja'],
    ['自動翻譯軌不列入選擇', { auto: ['ja'], translated: ['zh-TW'] }, 'auto:ja'],
  ] as const) {
    test(label, async (t) => {
      const api = await startApi(t, videoInfoWith(tracks))
      const { body } = await api.get(videoPath('https://youtu.be/AAAAAAAAAAA'))
      assert.equal(body.defaultTrackId, expected)
    })
  }
})

describe('GET /api/video：沒有字幕', () => {
  for (const [label, tracks] of [
    ['完全沒有字幕', {}],
    ['只有自動翻譯軌', { translated: ['zh-Hant', 'ja'] }],
  ] as const) {
    test(`${label}：回傳 200，tracks 為空陣列，defaultTrackId 為 null`, async (t) => {
      const api = await startApi(t, videoInfoWith(tracks))
      const { status, body } = await api.get(videoPath('https://youtu.be/AAAAAAAAAAA'))
      assert.equal(status, 200)
      assert.deepEqual(body.tracks, [])
      assert.equal(body.defaultTrackId, null)
    })
  }
})

/** 假的 yt-dlp：以結束碼 1 失敗並印出指定的 stderr */
function failsWith(stderr: string): RunYtDlp {
  return async () => ({ stdout: '', stderr, exitCode: 1 })
}

describe('GET /api/video：yt-dlp 失敗', () => {
  test('影片不存在：回傳 404 NOT_FOUND', async (t) => {
    const api = await startApi(t, failsWith(fixture('stderr-unavailable.txt')))
    const { status, body } = await api.get(videoPath('https://youtu.be/xxxxxxxxxxx'))
    assert.equal(status, 404)
    assert.equal(body.error.code, 'NOT_FOUND')
  })

  for (const name of [
    'stderr-age-restricted.txt',
    'stderr-private.txt',
    'stderr-members-only.txt',
  ]) {
    test(`${name}：回傳 403 LOGIN_REQUIRED`, async (t) => {
      const api = await startApi(t, failsWith(fixture(name)))
      const { status, body } = await api.get(videoPath('https://youtu.be/AAAAAAAAAAA'))
      assert.equal(status, 403)
      assert.equal(body.error.code, 'LOGIN_REQUIRED')
      assert.equal(body.error.message, '這支影片需要登入才能存取，目前不支援')
    })
  }

  for (const [name, stderr] of [
    [
      'HTTP 429',
      'ERROR: [youtube] AAAAAAAAAAA: Unable to download API page: HTTP Error 429: Too Many Requests\n',
    ],
    ['機器人驗證', fixture('stderr-bot-check.txt')],
  ]) {
    test(`${name}：回傳 503 RATE_LIMITED`, async (t) => {
      const api = await startApi(t, failsWith(stderr))
      const { status, body } = await api.get(videoPath('https://youtu.be/AAAAAAAAAAA'))
      assert.equal(status, 503)
      assert.equal(body.error.code, 'RATE_LIMITED')
      assert.match(body.error.message, /稍候/)
    })
  }

  test('其他錯誤：回傳 502 YTDLP_FAILED，並提示更新 yt-dlp', async (t) => {
    const api = await startApi(
      t,
      failsWith(
        'ERROR: [youtube] AAAAAAAAAAA: Failed to extract any player response; please report this issue on  https://github.com/yt-dlp/yt-dlp/issues\n',
      ),
    )
    const { status, body } = await api.get(videoPath('https://youtu.be/AAAAAAAAAAA'))
    assert.equal(status, 502)
    assert.equal(body.error.code, 'YTDLP_FAILED')
    assert.match(body.error.message, /更新 yt-dlp/)
  })

  test('無法執行 yt-dlp：回傳 502 YTDLP_FAILED', async (t) => {
    const api = await startApi(t, async () => {
      throw new Error('spawn yt-dlp ENOENT')
    })
    const { status, body } = await api.get(videoPath('https://youtu.be/AAAAAAAAAAA'))
    assert.equal(status, 502)
    assert.equal(body.error.code, 'YTDLP_FAILED')
  })
})

function transcriptPath(url: string, track?: string) {
  const query = new URLSearchParams({ url })
  if (track !== undefined) query.set('track', track)
  return `/api/transcript?${query}`
}

/** 假的 yt-dlp：模擬把字幕寫進 `-P` 指定的目錄 */
function writesSubtitle(fixtureName: string | null): RunYtDlp {
  return async (args) => {
    const dir = args[args.indexOf('-P') + 1]
    const language = args[args.indexOf('--sub-langs') + 1]
    if (fixtureName) writeFileSync(join(dir, `subtitle.${language}.json3`), fixture(fixtureName))
    return { stdout: '', stderr: '', exitCode: 0 }
  }
}

/** 把參數陣列中 `-P` 後面的暫存目錄換成 `<dir>`，方便比對 */
function withDirPlaceholder(args: string[]) {
  return args.map((arg, i) => (args[i - 1] === '-P' ? '<dir>' : arg))
}

describe('GET /api/transcript', () => {
  test('人工字幕：以 --write-subs 下載 json3，並依 -- 隔開網址', async (t) => {
    const api = await startApi(t, writesSubtitle('subtitle-manual.json3'))
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL0000000000'
    const { status } = await api.get(transcriptPath(url, 'manual:en'))
    assert.equal(status, 200)
    assert.deepEqual(withDirPlaceholder(api.calls[0]), [
      '--skip-download',
      '--no-playlist',
      '--write-subs',
      '--sub-langs',
      'en',
      '--sub-format',
      'json3',
      '-P',
      '<dir>',
      '-o',
      'subtitle',
      '--',
      url,
    ])
  })

  test('自動字幕：改用 --write-auto-subs', async (t) => {
    const api = await startApi(t, writesSubtitle('subtitle-auto.json3'))
    await api.get(transcriptPath('https://youtu.be/dQw4w9WgXcQ', 'auto:en'))
    assert.ok(api.calls[0].includes('--write-auto-subs'))
    assert.ok(!api.calls[0].includes('--write-subs'))
  })

  test('人工字幕的 json3：每個事件一段，換行改為空白', async (t) => {
    const api = await startApi(t, writesSubtitle('subtitle-manual.json3'))
    const { body } = await api.get(transcriptPath('https://youtu.be/dQw4w9WgXcQ', 'manual:en'))
    assert.deepEqual(body.cues, [
      { startMs: 1360, text: '[♪♪♪]' },
      { startMs: 18640, text: "♪ We're no strangers to love ♪" },
      { startMs: 22640, text: '♪ You know the rules and so do I ♪' },
      { startMs: 27040, text: "♪ A full commitment's what I'm thinking of ♪" },
    ])
  })

  test('自動字幕的 json3：串接逐字 segs，略過沒有 segs 與只有換行的事件', async (t) => {
    const api = await startApi(t, writesSubtitle('subtitle-auto.json3'))
    const { body } = await api.get(transcriptPath('https://youtu.be/dQw4w9WgXcQ', 'auto:en'))
    assert.deepEqual(body.cues, [
      { startMs: 320, text: '[Music]' },
      { startMs: 18800, text: "We're no strangers to" },
      { startMs: 21800, text: 'love. You know the rules and so do' },
      { startMs: 25960, text: "I. I feel commitments from what I'm" },
    ])
  })

  test('下載完成後刪除暫存目錄', async (t) => {
    const api = await startApi(t, writesSubtitle('subtitle-manual.json3'))
    await api.get(transcriptPath('https://youtu.be/dQw4w9WgXcQ', 'manual:en'))
    const dir = api.calls[0][api.calls[0].indexOf('-P') + 1]
    assert.equal(existsSync(dir), false)
  })

  test('yt-dlp 沒有產生字幕檔（影片沒有這一軌）：回傳 400 INVALID_TRACK', async (t) => {
    const api = await startApi(t, writesSubtitle(null))
    const { status, body } = await api.get(
      transcriptPath('https://youtu.be/dQw4w9WgXcQ', 'manual:xx'),
    )
    assert.equal(status, 400)
    assert.equal(body.error.code, 'INVALID_TRACK')
  })

  for (const [label, track] of [
    ['缺少 track', undefined],
    ['未知的種類', 'other:en'],
    ['語言含有正規表示式字元', 'manual:en.*'],
    ['語言以 - 開頭', 'manual:-en'],
    ['語言為空', 'manual:'],
  ] as const) {
    test(`${label}：回傳 400 INVALID_TRACK，且不呼叫 yt-dlp`, async (t) => {
      const api = await startApi(t, neverCalled)
      const { status, body } = await api.get(transcriptPath('https://youtu.be/dQw4w9WgXcQ', track))
      assert.equal(status, 400)
      assert.equal(body.error.code, 'INVALID_TRACK')
      assert.deepEqual(api.calls, [])
    })
  }

  test('網址不合法：回傳 400 INVALID_URL，且不呼叫 yt-dlp', async (t) => {
    const api = await startApi(t, neverCalled)
    const { status, body } = await api.get(transcriptPath('--exec=calc', 'manual:en'))
    assert.equal(status, 400)
    assert.equal(body.error.code, 'INVALID_URL')
    assert.deepEqual(api.calls, [])
  })

  test('需要登入的影片：回傳 403 LOGIN_REQUIRED', async (t) => {
    const api = await startApi(t, failsWith(fixture('stderr-private.txt')))
    const { status, body } = await api.get(
      transcriptPath('https://youtu.be/AAAAAAAAAAA', 'manual:en'),
    )
    assert.equal(status, 403)
    assert.equal(body.error.code, 'LOGIN_REQUIRED')
  })

  test('下載字幕被限流：回傳 503 RATE_LIMITED', async (t) => {
    const api = await startApi(t, failsWith(fixture('stderr-rate-limited.txt')))
    const { status, body } = await api.get(
      transcriptPath('https://youtu.be/AAAAAAAAAAA', 'manual:en'),
    )
    assert.equal(status, 503)
    assert.equal(body.error.code, 'RATE_LIMITED')
  })
})

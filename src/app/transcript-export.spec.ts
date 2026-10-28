import {
  copyText,
  trackOptionLabels,
  transcriptLines,
  txtContent,
  txtFileName,
} from './transcript-export'

describe('transcriptLines', () => {
  const cues = [
    { startMs: 1360, text: '[♪♪♪]' },
    { startMs: 83_999, text: "We're no strangers to love" },
  ]

  it('一小時以內的影片：每行顯示 [mm:ss] 與文字，秒數無條件捨去', () => {
    expect(transcriptLines(cues, { durationSeconds: 213, includeTimestamps: true })).toEqual([
      '[00:01] [♪♪♪]',
      "[01:23] We're no strangers to love",
    ])
  })

  it('長度 3599 秒：仍使用 [mm:ss]', () => {
    const lines = transcriptLines([{ startMs: 3_599_000, text: '最後' }], {
      durationSeconds: 3599,
      includeTimestamps: true,
    })
    expect(lines).toEqual(['[59:59] 最後'])
  })

  it('長度 3600 秒以上：整份改用 [hh:mm:ss]', () => {
    expect(transcriptLines(cues, { durationSeconds: 3600, includeTimestamps: true })).toEqual([
      '[00:00:01] [♪♪♪]',
      "[00:01:23] We're no strangers to love",
    ])
    const lines = transcriptLines([{ startMs: 8_624_520, text: 'Thank you' }], {
      durationSeconds: 8636,
      includeTimestamps: true,
    })
    expect(lines).toEqual(['[02:23:44] Thank you'])
  })

  it('長度為空值：以最後一段的起始時間判斷格式', () => {
    const short = transcriptLines(cues, { durationSeconds: null, includeTimestamps: true })
    expect(short[0]).toBe('[00:01] [♪♪♪]')
    const long = transcriptLines([...cues, { startMs: 3_600_000, text: '一小時' }], {
      durationSeconds: null,
      includeTimestamps: true,
    })
    expect(long).toEqual([
      '[00:00:01] [♪♪♪]',
      "[00:01:23] We're no strangers to love",
      '[01:00:00] 一小時',
    ])
  })

  it('不含時間戳：只輸出文字', () => {
    expect(transcriptLines(cues, { durationSeconds: 213, includeTimestamps: false })).toEqual([
      '[♪♪♪]',
      "We're no strangers to love",
    ])
  })
})

const source = {
  videoId: 'dQw4w9WgXcQ',
  title: 'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)',
  webpageUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  durationSeconds: 213,
  track: { language: 'en', kind: 'manual' as const },
}

const cues = [
  { startMs: 18_640, text: "We're no strangers to love" },
  { startMs: 22_640, text: 'You know the rules and so do I' },
]

describe('copyText', () => {
  it('以換行串接各行，不含檔頭', () => {
    expect(copyText(cues, { durationSeconds: 213, includeTimestamps: true })).toBe(
      "[00:18] We're no strangers to love\n[00:22] You know the rules and so do I",
    )
  })

  it('不含時間戳：只有文字', () => {
    expect(copyText(cues, { durationSeconds: 213, includeTimestamps: false })).toBe(
      "We're no strangers to love\nYou know the rules and so do I",
    )
  })
})

describe('txtContent', () => {
  it('檔頭依序為標題、網址、字幕軌，空一行後接字幕，以 LF 換行並以換行結尾', () => {
    expect(txtContent(source, cues, true)).toBe(
      [
        'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'en・人工字幕',
        '',
        "[00:18] We're no strangers to love",
        '[00:22] You know the rules and so do I',
        '',
      ].join('\n'),
    )
  })

  it('自動字幕標示為「自動字幕」；不含時間戳時檔頭不變', () => {
    const auto = { ...source, track: { language: 'en', kind: 'auto' as const } }
    expect(txtContent(auto, cues, false)).toBe(
      [
        'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'en・自動字幕',
        '',
        "We're no strangers to love",
        'You know the rules and so do I',
        '',
      ].join('\n'),
    )
  })
})

describe('txtFileName', () => {
  const withTitle = (title: string) => ({ ...source, title })

  it('格式為「<標題> [<videoId>].<語言>.txt」', () => {
    expect(txtFileName(source)).toBe(
      'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster) [dQw4w9WgXcQ].en.txt',
    )
  })

  it('Windows 不允許的字元換成 _', () => {
    expect(txtFileName(withTitle('a\\b/c:d*e?f"g<h>i|j'))).toBe(
      'a_b_c_d_e_f_g_h_i_j [dQw4w9WgXcQ].en.txt',
    )
  })

  it('控制字元換成 _', () => {
    expect(txtFileName(withTitle('a\tb\nc\u0000d'))).toBe('a_b_c_d [dQw4w9WgXcQ].en.txt')
  })

  it('去除標題結尾的空白與句點', () => {
    expect(txtFileName(withTitle('等等…還有. . '))).toBe('等等…還有 [dQw4w9WgXcQ].en.txt')
  })

  it('標題超過 150 個字元時截斷，不切斷表情符號', () => {
    expect(txtFileName(withTitle('😀'.repeat(200)))).toBe(
      `${'😀'.repeat(150)} [dQw4w9WgXcQ].en.txt`,
    )
  })

  it('截斷後結尾若是空白，一併去除', () => {
    expect(txtFileName(withTitle(`${'a'.repeat(149)} bcd`))).toBe(
      `${'a'.repeat(149)} [dQw4w9WgXcQ].en.txt`,
    )
  })

  it('字幕軌語言帶有後綴時照原樣放入檔名', () => {
    const lex = { ...source, track: { language: 'en-ehkg1hFWq8A', kind: 'manual' as const } }
    expect(txtFileName(lex)).toMatch(/\[dQw4w9WgXcQ\]\.en-ehkg1hFWq8A\.txt$/)
  })
})

describe('trackOptionLabels', () => {
  const track = (language: string, languageName: string, kind: 'manual' | 'auto') => ({
    id: `${kind}:${language}`,
    language,
    languageName,
    kind,
  })

  it('沒有重複時，不顯示語言代碼', () => {
    const tracks = [
      track('en-j3PyPqV-e1s', 'English - CC (English)', 'manual'),
      track('en', 'English', 'auto'),
    ]
    expect(trackOptionLabels(tracks)).toEqual({
      'manual:en-j3PyPqV-e1s': 'English - CC (English)・人工字幕',
      'auto:en': 'English・自動字幕',
    })
  })

  it('有重複時，只有重複的那幾軌補上語言代碼', () => {
    const tracks = [
      track('en-j3PyPqV-e1s', 'English - CC (English)', 'manual'),
      track('en', 'English', 'auto'),
      track('en-AbC', 'English', 'manual'),
      track('en-XyZ', 'English', 'manual'),
    ]
    expect(trackOptionLabels(tracks)).toEqual({
      'manual:en-j3PyPqV-e1s': 'English - CC (English)・人工字幕',
      'auto:en': 'English・自動字幕',
      'manual:en-AbC': 'English（en-AbC）・人工字幕',
      'manual:en-XyZ': 'English（en-XyZ）・人工字幕',
    })
  })

  it('languageName 相同但種類不同時，不算重複', () => {
    const tracks = [track('en', 'English', 'manual'), track('en', 'English', 'auto')]
    expect(trackOptionLabels(tracks)).toEqual({
      'manual:en': 'English・人工字幕',
      'auto:en': 'English・自動字幕',
    })
  })
})

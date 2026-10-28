import { Component, computed, inject, signal } from '@angular/core'
import type { Cue, VideoInfo } from '@shared/types'
import type { LineOptions, Loading } from './app.type'
import { TranscriptApi, errorMessage } from './transcript-api.service'
import {
  copyText,
  trackOptionLabels,
  transcriptLines,
  txtContent,
  txtFileName,
} from './transcript-export'

@Component({
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly api = inject(TranscriptApi)

  /** 輸入的網址 */
  readonly url = signal('')

  /** 影片資訊 */
  readonly video = signal<VideoInfo | null>(null)
  readonly selectedTrackId = signal<string | null>(null)

  /** 選定的字幕軌 */
  readonly cues = signal<Cue[] | null>(null)

  /** 載入中狀態  */
  readonly loading = signal<Loading>(null)

  /** 錯誤訊息 */
  readonly error = signal<string | null>(null)

  /** 是否包含時間戳 */
  readonly includeTimestamps = signal(true)
  readonly copied = signal(false)

  /** 送出的網址；字幕軌改選時沿用，避免使用者已修改輸入框 */
  private submittedUrl = ''

  /** 只採用最新一次請求的結果 */
  private requestId = 0
  private copiedTimer?: ReturnType<typeof setTimeout>

  /**
   * 逐字稿行選項
   */
  private readonly lineOptions = computed<LineOptions>(() => ({
    durationSeconds: this.video()?.durationSeconds ?? null,
    includeTimestamps: this.includeTimestamps(),
  }))

  /**
   * 畫面上一律顯示時間戳；開關只影響複製與下載
   */
  readonly displayLines = computed(() =>
    transcriptLines(this.cues() ?? [], { ...this.lineOptions(), includeTimestamps: true }),
  )

  readonly trackLabels = computed(() => trackOptionLabels(this.video()?.tracks ?? []))

  readonly selectedTrack = computed(() =>
    this.video()?.tracks.find((track) => track.id === this.selectedTrackId()),
  )

  /**
   * 取得影片資訊並重設先前結果；有預設字幕軌時接著載入逐字稿，載入影片期間忽略重複送出
   * @param event 提交事件
   */
  async submit(event: Event) {
    event.preventDefault()
    const url = this.url().trim()

    if (!url || this.loading()) return

    const id = ++this.requestId

    this.submittedUrl = url

    // 重設先前的影片與字幕軌資訊
    this.video.set(null)
    this.cues.set(null)
    this.selectedTrackId.set(null)
    this.error.set(null)
    this.loading.set('video')

    try {
      const video = await this.api.getVideo(url)

      if (id !== this.requestId) return

      this.video.set(video)
      this.loading.set(null)
      if (video.defaultTrackId) await this.selectTrack(video.defaultTrackId)
    } catch (error) {
      if (id !== this.requestId) return
      this.error.set(errorMessage(error))
      this.loading.set(null)
    }
  }

  /**
   * 載入指定字幕軌的逐字稿；使用送出時的網址，而非輸入框目前的內容
   */
  async selectTrack(trackId: string) {
    const id = ++this.requestId

    this.selectedTrackId.set(trackId)
    this.cues.set(null)
    this.error.set(null)
    this.loading.set('transcript')
    try {
      const cues = await this.api.getTranscript(this.submittedUrl, trackId)
      if (id !== this.requestId) return
      this.cues.set(cues)
    } catch (error) {
      if (id !== this.requestId) return
      this.error.set(errorMessage(error))
    } finally {
      if (id === this.requestId) this.loading.set(null)
    }
  }

  /**
   * 依時間戳設定複製全部逐字稿，並顯示「已複製」提示 2 秒；連續點擊會重新計時
   */
  async copyAll() {
    await navigator.clipboard.writeText(copyText(this.cues() ?? [], this.lineOptions()))
    this.copied.set(true)
    clearTimeout(this.copiedTimer)
    this.copiedTimer = setTimeout(() => this.copied.set(false), 2000)
  }

  /**
   * 依時間戳設定將逐字稿下載為 UTF-8 的 .txt 檔；尚未選定影片或字幕軌時不動作
   */
  download() {
    const video = this.video()
    const track = this.selectedTrack()

    if (!video || !track) return

    const source = { ...video, track }
    const blob = new Blob([txtContent(source, this.cues() ?? [], this.includeTimestamps())], {
      type: 'text/plain;charset=utf-8',
    })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = txtFileName(source)
    link.click()
    URL.revokeObjectURL(link.href)
  }
}

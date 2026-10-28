# 測試用 fixture

後端 HTTP API 測試使用的 yt-dlp 輸出

## 來源

用 yt-dlp 2026.08.19 對真實影片錄製，再精簡到只剩測試需要的欄位：

| 檔案                         | 影片        | 內容                                                                                           |
| ---------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `video-manual-and-auto.json` | dQw4w9WgXcQ | 有人工字幕和自動字幕。保留 `de-DE` 這種只有 m3u8 的自動字幕軌，以及 `zh-Hant`、`ab` 這類翻譯軌 |
| `video-auto-only.json`       | J---aiyznGQ | 只有自動字幕                                                                                   |
| `video-long.json`            | L_Guz73e6fw | 長度超過一小時；人工字幕的 key 是 `en-ehkg1hFWq8A`，不是純語言代碼                             |
| `subtitle-manual.json3`      | dQw4w9WgXcQ | 人工字幕 json3 的前 4 個事件                                                                   |
| `subtitle-auto.json3`        | dQw4w9WgXcQ | 自動字幕 json3 的前 8 個事件，包含沒有 `segs` 的事件和 `aAppend` 換行事件                      |
| `stderr-unavailable.txt`     | xxxxxxxxxxx | 影片不存在時的 stderr                                                                          |
| `stderr-rate-limited.txt`    | —           | 下載字幕時被 YouTube 以 HTTP 429 限流的 stderr                                                 |

`video-*.json` 只保留 `id`、`title`、`webpage_url`、`duration`、`subtitles`、`automatic_captions`，字幕軌只保留 json3 的項目；網址中的 IP 已換成 `0.0.0.0`

## 依原始碼組成的 fixture

`stderr-age-restricted.txt`、`stderr-private.txt`、`stderr-members-only.txt` 沒有錄到真實輸出。內容依 yt-dlp 原始碼的錯誤訊息格式組成：YouTube 回傳的原因含有「sign in」時，yt-dlp 會在後面接上 `--cookies` 的登入提示。遇到真實的這類影片時，應以實際輸出更新這些檔案

`stderr-bot-check.txt` 同樣依原始碼組成，是 YouTube 要求「確認不是機器人」時的錯誤。訊息同時含有「sign in」和 `--cookies`，但成因是 IP 被限流，不是影片需要登入

## 重新錄製

```sh
yt-dlp -J --skip-download --no-playlist -- "<影片網址>"
yt-dlp --skip-download --no-playlist --write-subs --sub-langs en --sub-format json3 -P <目錄> -o subtitle -- "<影片網址>"
```

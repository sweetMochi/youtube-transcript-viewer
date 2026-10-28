import { createApiServer } from './api.ts'
import { runYtDlp } from './yt-dlp.ts'

const HOST = '127.0.0.1'
const PORT = 3000

try {
  const { stdout, exitCode } = await runYtDlp(['--version'])
  if (exitCode !== 0) throw new Error(`yt-dlp --version 結束碼 ${exitCode}`)
  console.log(`yt-dlp ${stdout.trim()}`)
} catch (error) {
  console.error(
    '找不到 yt-dlp，請先安裝並確認在 PATH 中（例如 winget install yt-dlp），再重新開啟終端機',
  )
  console.error(error)
  process.exit(1)
}

createApiServer(runYtDlp).listen(PORT, HOST, () => {
  console.log(`本地 API 已啟動：http://${HOST}:${PORT}`)
})

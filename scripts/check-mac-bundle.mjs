import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

if (process.platform !== 'darwin') throw new Error('macOS에서 실행해 주세요.')
if (!process.argv[2]) throw new Error('검사할 .app 경로를 입력해 주세요.')

const app = resolve(process.argv[2])
const info = JSON.parse(
  execFileSync(
    '/usr/bin/plutil',
    ['-convert', 'json', '-o', '-', join(app, 'Contents', 'Info.plist')],
    { encoding: 'utf8' }
  )
)
const frameworks = join(app, 'Contents', 'Frameworks')
const names = readdirSync(frameworks)

for (const suffix of ['', ' (GPU)', ' (Plugin)', ' (Renderer)']) {
  const expected = `${info.CFBundleName} Helper${suffix}.app`
  // 정규화해 비교하면 눈에 같아 보여도 Electron이 찾지 못하는 문제를 놓칠 수 있다.
  if (!names.includes(expected)) throw new Error(`보조 앱 이름이 일치하지 않아요: ${expected}`)
  const helper = join(frameworks, expected)
  const helperInfo = JSON.parse(
    execFileSync(
      '/usr/bin/plutil',
      ['-convert', 'json', '-o', '-', join(helper, 'Contents', 'Info.plist')],
      { encoding: 'utf8' }
    )
  )
  if (!existsSync(join(helper, 'Contents', 'MacOS', helperInfo.CFBundleExecutable))) {
    throw new Error(`보조 앱 실행 파일을 찾을 수 없어요: ${expected}`)
  }
}
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
console.log('패키지 이름·보조 앱 실행 파일·서명 검증을 통과했어요.')

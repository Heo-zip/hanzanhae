/* eslint-disable @typescript-eslint/explicit-function-return-type -- 실행 스크립트는 JavaScript다. */
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const root = process.cwd()
const environment = { ...process.env }

if (process.platform === 'darwin' && !environment.ELECTRON_EXEC_PATH) {
  const electronDirectory = dirname(require.resolve('electron/package.json'))
  const electronVersion = JSON.parse(
    readFileSync(join(electronDirectory, 'package.json'), 'utf8')
  ).version
  const cache = join(root, 'node_modules', '.cache', 'hanzanhae-dev')
  const destination = join(cache, `${electronVersion}-${process.arch}-v1`)
  const application = join(destination, 'Electron.app')
  const executable = join(application, 'Contents', 'MacOS', 'Electron')
  const run = (command, args) => {
    const result = spawnSync(command, args, { encoding: 'utf8' })
    if (result.error || result.status !== 0) {
      throw new Error(
        `${command}: ${result.error?.message || result.stderr || `종료 코드 ${result.status}`}`
      )
    }
  }

  try {
    mkdirSync(cache, { recursive: true })
    if (!existsSync(executable)) {
      const temporary = mkdtempSync(join(cache, '.prepare-'))
      try {
        const copy = join(temporary, 'Electron.app')
        console.log('알림 테스트를 위한 개발용 앱을 준비하고 있어요. 처음 한 번만 실행돼요.')
        const original = join(electronDirectory, 'dist', 'Electron.app')
        const cloned = spawnSync('cp', ['-cR', original, copy], { encoding: 'utf8' })
        if (cloned.error || cloned.status !== 0) {
          rmSync(copy, { recursive: true, force: true })
          run('cp', ['-R', original, copy])
        }
        run('/usr/libexec/PlistBuddy', [
          '-c',
          'Set :CFBundleIdentifier com.heozip.hanzanhae.dev',
          '-c',
          'Set :CFBundleName 한잔해 개발',
          '-c',
          'Set :CFBundleDisplayName 한잔해 개발',
          join(copy, 'Contents', 'Info.plist')
        ])
        run('codesign', ['--force', '--deep', '--sign', '-', copy])
        run('codesign', ['--verify', '--deep', '--strict', copy])
        try {
          renameSync(temporary, destination)
        } catch (error) {
          if (!existsSync(executable)) throw error
        }
      } finally {
        rmSync(temporary, { recursive: true, force: true })
      }
    }
    environment.ELECTRON_EXEC_PATH = executable
  } catch (error) {
    console.error(
      '개발용 앱 준비에 실패했어요. Xcode 명령줄 도구와 디스크 권한을 확인해 주세요.',
      error.message
    )
    process.exit(1)
  }
}

const command = join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite'
)
const child = spawn(command, ['dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: environment
})
child.on('error', (error) => {
  console.error('개발 서버를 실행하지 못했어요.', error.message)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1)
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal)
  })
}

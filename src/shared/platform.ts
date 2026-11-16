// OS마다 Electron이 제공하는 기능이 달라 main 프로세스와 화면이 같은 기준으로 지원 여부를 판단한다.
// 값은 process.platform 문자열(darwin·win32·linux 등)이다.
export function platformSupport(platform: string): {
  loginItem: boolean
  autoUpdate: boolean
  gardenClickThrough: boolean
  screenLockEvents: boolean
} {
  const macOrWindows = platform === 'darwin' || platform === 'win32'
  return {
    // Electron의 로그인 항목 API는 macOS·Windows만 지원한다.
    loginItem: macOrWindows,
    // 서명·배포 저장소·설치 검증을 macOS만 마쳤다.
    autoUpdate: platform === 'darwin',
    // 투명한 부분 클릭 통과(forward 옵션)는 macOS·Windows만 지원한다.
    gardenClickThrough: macOrWindows,
    // powerMonitor의 화면 잠금·해제 이벤트는 macOS·Windows만 보낸다.
    screenLockEvents: macOrWindows
  }
}

export function platformName(platform: string): string {
  return platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : 'Linux'
}

// 화면 아래 앱 목록 막대의 OS별 이름이다. 정원의 'dock' 위치 문구에 쓴다.
export function dockName(platform: string): string {
  return platform === 'darwin' ? 'Dock' : '작업 표시줄'
}

// 알림·카메라 권한을 바꾸는 OS 설정 위치다.
export function permissionSettingsHint(platform: string, kind: '알림' | '카메라'): string {
  if (platform === 'darwin') return `Mac 시스템 설정 → ${kind}`
  if (platform === 'win32')
    return kind === '알림'
      ? 'Windows 설정 → 시스템 → 알림'
      : 'Windows 설정 → 개인 정보 및 보안 → 카메라'
  return `데스크톱 환경의 ${kind} 설정`
}

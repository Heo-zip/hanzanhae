/** 신뢰된 대시보드 메인 프레임의 주소인지 확인한다. */
export function isDashboardUrl(url: string | undefined, expectedUrl: string): boolean {
  try {
    if (!url) return false
    const actual = new URL(url)
    const expected = new URL(expectedUrl)
    return (
      actual.origin === expected.origin && actual.pathname === expected.pathname && !actual.search
    )
  } catch {
    return false
  }
}

/** 요청한 앱 내부 모델 파일명만 반환한다. 파일 경로는 메인에서 직접 만든다. */
export function cameraAssetName(requestUrl: string, method: string): string | null {
  try {
    const url = new URL(requestUrl)
    const allowed =
      /^\/(?:vision_wasm_internal-[\w-]+\.(?:js|wasm)|efficientdet_lite0-[\w-]+\.tflite|(?:face_landmarker|pose_landmarker_lite)-[\w-]+\.task)$/
    return method === 'GET' &&
      url.protocol === 'hanzanhae-assets:' &&
      url.host === 'app' &&
      !url.search &&
      allowed.test(url.pathname)
      ? url.pathname.slice(1)
      : null
  } catch {
    return null
  }
}

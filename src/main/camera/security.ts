export const PACKAGED_RENDERER_URL = 'hanzanhae-app://app/index.html'

/** 메인 프레임의 주소가 창에 지정한 주소와 정확히 일치하는지 확인한다. */
export function isRendererUrl(url: string | undefined, expectedUrl: string): boolean {
  try {
    return !!url && new URL(url).href === new URL(expectedUrl).href
  } catch {
    return false
  }
}

/** 배포 화면과 번들 에셋만 앱 전용 주소로 읽는다. */
export function rendererAssetPath(requestUrl: string, method: string): string | null {
  try {
    const url = new URL(requestUrl)
    if (
      method !== 'GET' ||
      url.protocol !== 'hanzanhae-app:' ||
      url.host !== 'app' ||
      url.username ||
      url.password ||
      url.hash
    )
      return null
    if (url.pathname === '/index.html' && (!url.search || url.search === '?view=garden'))
      return 'index.html'
    const asset = /^\/assets\/[\w.-]+\.(?:css|js|mjs|webp|png|jpe?g|svg|avif|woff2?)$/
    return !url.search && asset.test(url.pathname) ? url.pathname.slice(1) : null
  } catch {
    return null
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

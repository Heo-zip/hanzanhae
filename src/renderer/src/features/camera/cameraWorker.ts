import { createAnalyzer, type Analyzer, type AnalyzerAssets } from './cameraAnalyzer'

// 카메라 분석 전용 Worker. 화면 쪽은 0.25초마다 영상 한 장(ImageBitmap)만 넘기고,
// 모델 실행과 판정은 여기서 해 대시보드 애니메이션이 멈추지 않게 한다.
// MediaPipe가 실행 파일을 importScripts로 불러오므로 일반(classic) Worker로 빌드한다.

export type WorkerRequest =
  { type: 'init'; assets: AnalyzerAssets } | { type: 'frame'; image: ImageBitmap }
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; result: import('./cameraAnalyzer').AnalysisResult }
  | { type: 'error'; message: string }

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage: (message: WorkerResponse) => void
}
let analyzer: Analyzer | null = null

scope.onmessage = async (event) => {
  const request = event.data
  try {
    if (request.type === 'init') {
      analyzer = await createAnalyzer(request.assets)
      scope.postMessage({ type: 'ready' })
      return
    }
    const { image } = request
    try {
      if (!analyzer) throw new Error('분석기가 준비되지 않았어요')
      scope.postMessage({
        type: 'result',
        result: analyzer.analyze(image, image.width, image.height)
      })
    } finally {
      image.close()
    }
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

import { type CameraControl } from '../camera/useCameraDetection'

const sipSteps = [
  { key: 'held', label: '컵이나 병을 들어요' },
  { key: 'mouth', label: '입으로 가져가요' },
  { key: 'sip', label: '고개를 젖히거나 빨대로 마셔요' }
] as const

/**
 * 카메라가 지금 무엇을 보고 있는지 사용자가 직접 확인하는 화면이다.
 * 캔버스 ref 콜백과 렌더링 값을 한 객체로 넘기면 react-hooks/refs 규칙에 걸려 따로 받는다.
 */
export default function CameraView({
  setPreview,
  sipCount,
  status
}: {
  setPreview: CameraControl['setPreview']
  sipCount: number
  status: CameraControl['detectionStatus']
}): React.JSX.Element {
  const done = {
    held: Boolean(status?.held),
    mouth: status?.handAtMouth === true || status?.sipPhase !== 'idle',
    sip: status?.sipPhase === 'sipping'
  }
  const holdHint =
    status?.holdSource === 'touch'
      ? '손에 든 걸 찾았어요'
      : status?.holdSource === 'zoom'
        ? '손 주변을 확대해 찾았어요'
        : status?.holdSource === 'pickup'
          ? '집어 드는 걸 봤어요'
          : status?.holdSource === 'mouth'
            ? '입에 댄 걸 찾았어요'
            : '손을 가슴 위로 들면 주변을 확대해 찾아요'
  const headHint = status?.straw
    ? '빨대로 마시는 걸 봤어요'
    : status?.headSource === 'face'
      ? `고개 ${(status.lift ?? 0) > 0 ? '+' : ''}${status.lift}°`
      : status?.headSource === 'pose'
        ? '몸 자세로 보고 있어요'
        : status?.headSource === 'covered'
          ? '얼굴이 가려져도 이어서 봐요'
          : '얼굴을 찾고 있어요'
  return (
    <div className="camera-view">
      <div className="camera-preview-frame">
        <canvas
          ref={setPreview}
          className="camera-preview"
          aria-label="카메라가 인식한 얼굴, 손, 컵을 보여주는 화면"
        />
        <div key={sipCount} className="camera-detection-count" role="status">
          마신 동작 <strong>{sipCount}회</strong>
        </div>
      </div>
      <div className="camera-guide">
        <ol className="camera-steps" aria-label="마시는 동작 인식 단계">
          {sipSteps.map((step, index) => (
            <li key={step.key} className={done[step.key] ? 'on' : ''}>
              <span className="camera-step-num" aria-hidden="true">
                {done[step.key] ? '✓' : index + 1}
              </span>
              <span>
                {step.label}
                {step.key === 'held' && <small>{holdHint}</small>}
                {step.key === 'sip' && <small>{headHint}</small>}
              </span>
            </li>
          ))}
        </ol>
        <ul className="camera-legend" aria-label="화면 표시">
          <li className="face">얼굴</li>
          <li className="cup">컵·병</li>
          <li className="hand">손·확대 영역</li>
          <li className="mouth">입</li>
        </ul>
        {/* 빨대 판정은 입 오므림이 0.45 이상일 때다. 기준을 조정할 때 이 값을 본다. */}
        <p className="camera-measure" aria-label="입 모양 측정값">
          입 오므림 <b className="num">{status?.mouth ? status.mouth.pucker.toFixed(2) : '–'}</b>
          <small>3초 최고 {status?.mouthPeak ? status.mouthPeak.pucker.toFixed(2) : '–'}</small>·
          입술 모음 <b className="num">{status?.mouth ? status.mouth.funnel.toFixed(2) : '–'}</b>
          <small>3초 최고 {status?.mouthPeak ? status.mouthPeak.funnel.toFixed(2) : '–'}</small>
        </p>
      </div>
    </div>
  )
}

// 오늘·기록·설정 화면이 함께 쓰는 작은 표시 조각이다.
// 오늘 화면과 기록 화면에서 같은 형태의 요약 수치를 재사용한다.
export function Metric({
  icon,
  label,
  value,
  unit
}: {
  icon: string
  label: string
  value: string | number
  unit: string
}): React.JSX.Element {
  return (
    <div className="tile">
      <img className="ic" src={icon} alt="" />
      <div>
        <span>{label}</span>
        <b className="num">
          {value}
          <small>{unit}</small>
        </b>
      </div>
    </div>
  )
}

export function Glass({
  percent,
  height
}: {
  percent: number
  height?: number
}): React.JSX.Element {
  // 목표를 초과해도 컵의 물은 컵 높이를 넘지 않도록 제한한다.
  return (
    <span className="glass" style={height ? { height } : undefined} aria-hidden="true">
      <i style={{ height: `${Math.min(100, percent)}%` }} />
    </span>
  )
}

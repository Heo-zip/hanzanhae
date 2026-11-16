import type { PlantStage } from '../../../../shared/appState'
import seedling100 from '../../assets/plants/seedling-100.webp'
import seedling80 from '../../assets/plants/seedling-80.webp'
import seedling60 from '../../assets/plants/seedling-60.webp'
import seedling40 from '../../assets/plants/seedling-40.webp'
import seedling20 from '../../assets/plants/seedling-20.webp'
import young100 from '../../assets/plants/young-100.webp'
import young80 from '../../assets/plants/young-80.webp'
import young60 from '../../assets/plants/young-60.webp'
import young40 from '../../assets/plants/young-40.webp'
import young20 from '../../assets/plants/young-20.webp'
import leafy100 from '../../assets/plants/leafy-100.webp'
import leafy80 from '../../assets/plants/leafy-80.webp'
import leafy60 from '../../assets/plants/leafy-60.webp'
import leafy40 from '../../assets/plants/leafy-40.webp'
import leafy20 from '../../assets/plants/leafy-20.webp'
import flower100 from '../../assets/plants/flower-100.webp'
import flower80 from '../../assets/plants/flower-80.webp'
import flower60 from '../../assets/plants/flower-60.webp'
import flower40 from '../../assets/plants/flower-40.webp'
import flower20 from '../../assets/plants/flower-20.webp'

/** 생기를 사진 5장(20·40·60·80·100) 중 하나로 묶는다. 경계는 docs/product.md의 생기 표와 같다. */
export type VitalityLevel = 100 | 80 | 60 | 40 | 20
export function vitalityLevel(vitality: number): VitalityLevel {
  return vitality >= 90 ? 100 : vitality >= 70 ? 80 : vitality >= 50 ? 60 : vitality >= 30 ? 40 : 20
}

// 성장 단계마다 생기 5단계 사진이 있다. 모든 사진의 화분 위치·크기가 같다.
const images: Record<PlantStage, Record<VitalityLevel, string>> = {
  seedling: { 100: seedling100, 80: seedling80, 60: seedling60, 40: seedling40, 20: seedling20 },
  young: { 100: young100, 80: young80, 60: young60, 40: young40, 20: young20 },
  leafy: { 100: leafy100, 80: leafy80, 60: leafy60, 40: leafy40, 20: leafy20 },
  flower: { 100: flower100, 80: flower80, 60: flower60, 40: flower40, 20: flower20 }
}

// 화분 테두리 높이(사진 800px 기준). 정원은 이 선 위의 잎만 흔든다.
const RIM = 477

export const plants = [
  { id: 'seedling', name: '새싹', image: seedling80, rim: RIM },
  { id: 'young', name: '어린 잎', image: young80, rim: RIM },
  { id: 'leafy', name: '무성한 잎', image: leafy80, rim: RIM },
  { id: 'flower', name: '꽃', image: flower80, rim: RIM }
] as const

export function plantIndex(stage: PlantStage): number {
  return plants.findIndex((plant) => plant.id === stage)
}

/** image: 사진, rim: 화분 테두리 높이(사진 800px 기준), filter: 잎에만 거는 색 조절 */
export type PlantFrame = { image: string; rim: number; filter?: string }

// 같은 사진 구간 안에서도 생기가 10 떨어지면 조금 바래 보이게 해 한 시간마다의 변화를 드러낸다.
const lowerHalf = 'saturate(0.85) brightness(0.97)'

export function plantFrame(stage: PlantStage, vitality: number): PlantFrame {
  const level = vitalityLevel(vitality)
  const image = images[stage][level]
  // 80·60·40 사진은 20 폭이라 아래쪽 10(예: 70~79)에서 한 번 더 바랜다.
  const dimmed = level !== 100 && level !== 20 && vitality < level - 10
  return dimmed ? { image, rim: RIM, filter: lowerHalf } : { image, rim: RIM }
}

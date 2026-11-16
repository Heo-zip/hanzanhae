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
import stage3 from '../../assets/stage3.webp'
import stage3Wilted from '../../assets/stage3_wilted.webp'
import stage4 from '../../assets/stage4.webp'

export const plants = [
  { id: 'seedling', name: '새싹', image: seedling80, rim: 477 },
  { id: 'young', name: '어린 잎', image: young80, rim: 477 },
  { id: 'leafy', name: '무성한 잎', image: stage3, rim: 405 },
  { id: 'flower', name: '꽃', image: stage4, rim: 422 }
] as const

export function plantIndex(stage: PlantStage): number {
  return plants.findIndex((plant) => plant.id === stage)
}

/** 생기를 사진 5장(20·40·60·80·100) 중 하나로 묶는다. 경계는 docs/product.md의 생기 표와 같다. */
export type VitalityLevel = 100 | 80 | 60 | 40 | 20
export function vitalityLevel(vitality: number): VitalityLevel {
  return vitality >= 90 ? 100 : vitality >= 70 ? 80 : vitality >= 50 ? 60 : vitality >= 30 ? 40 : 20
}

/** image: 사진, rim: 화분 테두리 높이(사진 800px 기준), filter: 잎에만 거는 색 조절 */
export type PlantFrame = { image: string; rim: number; filter?: string }

// 새 사진이 아직 없는 성장 단계는 기존 사진과 색 조절로 5단계를 임시로 보여 준다.
const mild = 'saturate(0.7) sepia(0.15)'
const strong = 'saturate(0.4) sepia(0.4) brightness(0.94)'
const frames: Record<PlantStage, Record<VitalityLevel, PlantFrame>> = {
  // 새싹·어린 잎은 새 사진 5장이다. 화분 위치가 모두 같아 테두리 높이도 하나다.
  seedling: {
    100: { image: seedling100, rim: 477 },
    80: { image: seedling80, rim: 477 },
    60: { image: seedling60, rim: 477 },
    40: { image: seedling40, rim: 477 },
    20: { image: seedling20, rim: 477 }
  },
  young: {
    100: { image: young100, rim: 477 },
    80: { image: young80, rim: 477 },
    60: { image: young60, rim: 477 },
    40: { image: young40, rim: 477 },
    20: { image: young20, rim: 477 }
  },
  leafy: {
    100: { image: stage3, rim: 405 },
    80: { image: stage3, rim: 405 },
    60: { image: stage3, rim: 405, filter: mild },
    40: { image: stage3Wilted, rim: 412 },
    20: { image: stage3Wilted, rim: 412, filter: strong }
  },
  flower: {
    100: { image: stage4, rim: 422 },
    80: { image: stage4, rim: 422 },
    60: { image: stage4, rim: 422, filter: mild },
    40: { image: stage4, rim: 422, filter: strong },
    20: { image: stage4, rim: 422, filter: `${strong} grayscale(0.3)` }
  }
}

// 같은 사진 구간 안에서도 생기가 10 떨어지면 조금 바래 보이게 해 한 시간마다의 변화를 드러낸다.
const lowerHalf = 'saturate(0.85) brightness(0.97)'

export function plantFrame(stage: PlantStage, vitality: number): PlantFrame {
  const level = vitalityLevel(vitality)
  const frame = frames[stage][level]
  // 80·60·40 사진은 20 폭이라 아래쪽 10(예: 70~79)에서 한 번 더 바랜다.
  const dimmed = level !== 100 && level !== 20 && vitality < level - 10
  if (!dimmed) return frame
  return { ...frame, filter: frame.filter ? `${frame.filter} ${lowerHalf}` : lowerHalf }
}

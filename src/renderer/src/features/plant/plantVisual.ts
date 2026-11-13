import type { PlantStage } from '../../../../shared/appState'
import stage1 from '../../assets/stage1.webp'
import stage2 from '../../assets/stage2.webp'
import stage2Watered from '../../assets/stage2_watered.webp'
import stage2Wilted from '../../assets/stage2_wilted.webp'
import stage3 from '../../assets/stage3.webp'
import stage3Wilted from '../../assets/stage3_wilted.webp'
import stage4 from '../../assets/stage4.webp'
import stage4Watered from '../../assets/stage4_watered.webp'

export const plants = [
  { id: 'seedling', name: '새싹', image: stage1, rim: 477 },
  {
    id: 'young',
    name: '어린 잎',
    image: stage2,
    rim: 435,
    watered: stage2Watered,
    wilted: stage2Wilted
  },
  { id: 'leafy', name: '무성한 잎', image: stage3, rim: 405, wilted: stage3Wilted },
  { id: 'flower', name: '꽃', image: stage4, rim: 422, watered: stage4Watered }
] as const

export function plantIndex(stage: PlantStage): number {
  return plants.findIndex((plant) => plant.id === stage)
}

export function plantImage(stage: PlantStage, vitality: number, watered = false): string {
  const plant: { image: string; watered?: string; wilted?: string } = plants[plantIndex(stage)]
  return (watered && plant.watered) || (vitality < 45 && plant.wilted) || plant.image
}

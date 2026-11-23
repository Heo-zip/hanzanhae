// 입력칸 값이 숫자로만 된 ml 정수인지 확인한다. '1e3', '1.5' 같은 표기는 받지 않는다.
export function isMlInput(value: string, allowZero = false): boolean {
  const amount = Number(value)
  return /^\d+$/.test(value) && Number.isSafeInteger(amount) && (allowZero || amount > 0)
}

export function getStableHashCode(value: string): number {
  let hash1 = 5381
  let hash2 = hash1

  for (let index = 0; index < value.length; index += 2) {
    hash1 = Math.imul((hash1 << 5) + hash1, 1) ^ value.charCodeAt(index)
    if (index === value.length - 1) break
    hash2 = Math.imul((hash2 << 5) + hash2, 1) ^ value.charCodeAt(index + 1)
  }

  return (hash1 + Math.imul(hash2, 1_566_083_941)) | 0
}

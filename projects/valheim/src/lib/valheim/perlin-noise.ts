const PERMUTATION = [
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
  140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
  247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32,
  57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
  74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122,
  60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54,
  65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169,
  200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64,
  52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212,
  207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213,
  119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
  129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104,
  218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
  81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
  184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
  222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
] as const

const PERMUTATION_TABLE = [...PERMUTATION, ...PERMUTATION]
const f32 = Math.fround

function fade(value: number): number {
  const clamped = Math.min(1, value)
  const cubic = f32(f32(clamped * clamped) * clamped)
  const polynomial = f32(f32(f32(f32(clamped * 6) - 15) * clamped) + 10)

  return f32(polynomial * cubic)
}

function gradient(hash: number, x: number, y: number): number {
  const maskedHash = hash & 15
  const first = maskedHash < 8 ? x : y
  const second =
    maskedHash < 4
      ? y
      : maskedHash === 12 || maskedHash === 14
        ? x
        : 0
  const signedFirst = (maskedHash & 1) === 0 ? first : f32(-first)
  const signedSecond = (maskedHash & 2) === 0 ? second : f32(-second)

  return f32(signedFirst + signedSecond)
}

function interpolate(start: number, end: number, amount: number): number {
  return f32(f32(f32(end - start) * amount) + start)
}

/** Matches Mathf.PerlinNoise in Valheim's bundled Unity 6000.0.61f1 player. */
export function perlinNoise(x: number, y: number): number {
  const absoluteX = f32(Math.abs(f32(x)))
  const absoluteY = f32(Math.abs(f32(y)))
  const integerX = Math.trunc(absoluteX)
  const integerY = Math.trunc(absoluteY)
  const tableX = integerX & 255
  const tableY = integerY & 255
  const fractionX = f32(absoluteX - f32(integerX))
  const fractionY = f32(absoluteY - f32(integerY))
  const previousX = f32(fractionX - 1)
  const previousY = f32(fractionY - 1)
  const fadeX = fade(fractionX)
  const fadeY = fade(fractionY)

  const row = PERMUTATION_TABLE[tableX] + tableY
  const nextRow = PERMUTATION_TABLE[tableX + 1] + tableY
  const lowerLeftHash = PERMUTATION_TABLE[PERMUTATION_TABLE[row]]
  const lowerRightHash = PERMUTATION_TABLE[PERMUTATION_TABLE[nextRow]]
  const upperLeftHash = PERMUTATION_TABLE[PERMUTATION_TABLE[row + 1]]
  const upperRightHash = PERMUTATION_TABLE[PERMUTATION_TABLE[nextRow + 1]]

  const lower = interpolate(
    gradient(lowerLeftHash, fractionX, fractionY),
    gradient(lowerRightHash, previousX, fractionY),
    fadeX,
  )
  const upper = interpolate(
    gradient(upperLeftHash, fractionX, previousY),
    gradient(upperRightHash, previousX, previousY),
    fadeX,
  )
  const rawNoise = interpolate(lower, upper, fadeY)

  return f32(f32(rawNoise + f32(0.69)) / f32(1.483))
}

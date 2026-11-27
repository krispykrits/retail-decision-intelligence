export const horizonLabels = [1, 2, 3, 4].map((weeks) => ({
  weeks,
  label: weeks === 1 ? '1 week' : `${weeks} weeks`,
}))

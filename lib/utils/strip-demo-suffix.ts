/** Remove trailing "(demo)" label from display names (legacy seed / demo accounts). */
export function stripDemoSuffix(value: string): string {
  return value.replace(/\s*\(demo\)\s*$/i, '').trim()
}

export function formatJson(text: string): string {
  return JSON.stringify(JSON.parse(text), null, 2)
}

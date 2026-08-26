export function notesToPlain(text?: string): string {
  return (text ?? '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/, '')
        .replace(/^>\s*/, '')
        .replace(/^\s*[-*]\s+/, '• ')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1'),
    )
    .join('\n')
    .trim()
}

export function formatUSD(value: number): string {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  if (value >= 0.1) {
    return `$${value.toFixed(2)}`;
  }
  if (value >= 0.01) {
    return `$${value.toFixed(3)}`;
  }
  return `$${value.toFixed(6)}`;
}

export function formatNumber(
  value: number | null | undefined,
  { estimated = false }: { estimated?: boolean } = {},
): string {
  if (value == null) {
    return 'n/a';
  }
  const suffix = estimated ? ' (est.)' : '';
  // Use en-US locale for consistent formatting across platforms (comma separator)
  return `${value.toLocaleString('en-US')}${suffix}`;
}

export function formatElapsed(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(2)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  let seconds = Math.round(totalSeconds - minutes * 60);
  let adjustedMinutes = minutes;
  if (seconds === 60) {
    adjustedMinutes += 1;
    seconds = 0;
  }
  return `${adjustedMinutes}m ${seconds}s`;
}

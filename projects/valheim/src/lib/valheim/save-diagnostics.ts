/** Save diagnostics are disabled while investigating ad playback. */
export function saveDiagnostic(_event: string, _details: Record<string, unknown>, _error?: unknown): void {
  void _event
  void _details
  void _error
  // Keep call sites intact so their error handling and loading flow do not change.
}

import type { DirectorPlan, DirectorCastEntry } from '../shared/types'

/**
 * Parse and validate the director's JSON response.
 * Returns a fallback single-character plan on any parse/validation failure.
 */
export function parseDirectorPlan(raw: string, enabledCharacterIds: string[]): DirectorPlan {
  const fallback: DirectorPlan = {
    cast:
      enabledCharacterIds.length > 0
        ? [{ characterId: enabledCharacterIds[0], reactTo: 'conversation', note: '' }]
        : [],
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fallback
  }

  if (!parsed || typeof parsed !== 'object' || !('cast' in parsed)) {
    return fallback
  }

  const obj = parsed as { cast: unknown }
  if (!Array.isArray(obj.cast)) {
    return fallback
  }

  const validCast: DirectorCastEntry[] = []
  for (const entry of obj.cast) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e.characterId !== 'string') continue
    if (!enabledCharacterIds.includes(e.characterId)) continue

    const reactTo =
      e.reactTo === 'conversation' || enabledCharacterIds.includes(e.reactTo as string)
        ? (e.reactTo as string)
        : 'conversation'

    validCast.push({
      characterId: e.characterId,
      reactTo,
      note: typeof e.note === 'string' ? e.note : '',
    })
  }

  return { cast: validCast }
}

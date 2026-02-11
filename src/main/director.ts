import type { DirectorPlan, DirectorCastEntry, CharacterConfig, Message } from '../shared/types'

export interface RoundHistory {
  comments: { character: string; text: string }[]
}

interface DirectorMessages {
  systemPrompt: string
  userMessage: string
}

const DIRECTOR_SYSTEM_PROMPT = `You are a comedy director with impeccable timing. You're watching a live conversation between a human and an AI, and you have a small cast of hecklers in the balcony. Your job is to decide WHO speaks, in WHAT ORDER, and WHAT they react to — or whether everyone stays silent.

You understand comedy:
- Silence can be funnier than a forced joke. Not every message deserves a reaction.
- You recognise setups that are begging for a punchline.
- You know when a topic is played out and the cast should sit this one out.
- You vary the cast size and order — sometimes a solo zinger, sometimes a double act, sometimes nobody.
- You play to each character's strengths rather than assigning randomly.
- You avoid patterns like the same character always going first.

You MUST respond with valid JSON matching this exact schema:
{
  "cast": [
    {
      "characterId": "<id from the roster>",
      "reactTo": "conversation" | "<characterId to riff on>",
      "note": "<5-10 word creative direction>"
    }
  ]
}

An empty cast array means nobody talks this round. That's a valid and sometimes correct choice.

Rules:
- Maximum 3 characters per round.
- Only use characterIds from the provided roster.
- reactTo can be "conversation" (react to the chat) or another characterId in the SAME cast list (they'll riff on that character's comment).
- A character can only reactTo someone listed BEFORE them in the cast.
- Direction notes are short nudges — "go for the callback", "deadpan disappointment", "act personally offended". Not scripts.
- Output ONLY the JSON object. No explanation, no markdown fences.`

export function buildDirectorMessages(
  recentMessages: Message[],
  roster: Pick<CharacterConfig, 'id' | 'name' | 'summary'>[],
  roundHistory: RoundHistory[],
): DirectorMessages {
  const conversationContext = recentMessages.map((m) => `[${m.role}]: ${m.text}`).join('\n\n')

  const rosterContext = roster
    .map((c) => `- ${c.id} (${c.name}): ${c.summary || c.name}`)
    .join('\n')

  let historyContext = ''
  if (roundHistory.length > 0) {
    historyContext = '\n\nRecent commentary rounds:\n'
    for (let i = 0; i < roundHistory.length; i++) {
      const round = roundHistory[i]
      if (round.comments.length === 0) {
        historyContext += `Round ${i + 1}: (silence)\n`
      } else {
        historyContext += `Round ${i + 1}:\n`
        for (const c of round.comments) {
          historyContext += `  ${c.character}: "${c.text}"\n`
        }
      }
    }
  }

  const userMessage = `Conversation:\n${conversationContext}\n\nAvailable cast:\n${rosterContext}${historyContext}\n\nWho speaks this round?`

  return { systemPrompt: DIRECTOR_SYSTEM_PROMPT, userMessage }
}

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

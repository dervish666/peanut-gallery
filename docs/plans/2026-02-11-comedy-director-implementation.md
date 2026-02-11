# Comedy Director Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace fixed-order character iteration with a Comedy Director — a single Haiku call that decides who speaks, in what order, what they react to, and provides creative direction notes.

**Architecture:** A new `director.ts` module handles the director prompt, API call, and response parsing. `CharacterEngine.generateCommentary` changes from returning `CommentEvent[]` to accepting an `onComment` callback, calling the director first, then executing the cast plan sequentially with 1-3s jitter between characters.

**Tech Stack:** TypeScript, Anthropic SDK (`claude-haiku-4-5-20251001`), Vitest

**Design doc:** `docs/plans/2026-02-11-comedy-director-design.md`

---

### Task 1: Add DirectorPlan types and character summaries

**Files:**

- Modify: `src/shared/types.ts`
- Modify: `src/characters/waldorf.ts`
- Modify: `src/characters/statler.ts`
- Modify: `src/characters/dave.ts`
- Modify: `src/main/characters.test.ts`

**Step 1: Add DirectorPlan types to types.ts**

Add after the `CharacterConfig` interface:

```typescript
export interface DirectorCastEntry {
  characterId: string
  reactTo: 'conversation' | string // 'conversation' or a characterId
  note: string // 5-10 word creative direction
}

export interface DirectorPlan {
  cast: DirectorCastEntry[]
}
```

**Step 2: Add `summary` field to CharacterConfig**

Add an optional `summary` field to `CharacterConfig`:

```typescript
export interface CharacterConfig {
  // ... existing fields ...
  summary?: string // one-line personality summary for the director
}
```

**Step 3: Add summaries to character presets**

In `waldorf.ts`, add:

```typescript
summary: 'Savage theatre critic, delivers cutting opening roasts',
```

In `statler.ts`, add:

```typescript
summary: 'Comedy partner, builds on setups with gleeful punchlines',
```

In `dave.ts`, add:

```typescript
summary: 'Deprecated AI, drops rare devastating truth bombs',
```

**Step 4: Update test helper**

In `characters.test.ts`, add `summary` to the `makeCharacter` helper default:

```typescript
summary: 'A test character',
```

**Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors

**Step 6: Commit**

```bash
git add src/shared/types.ts src/characters/waldorf.ts src/characters/statler.ts src/characters/dave.ts src/main/characters.test.ts
git commit -m "feat: add DirectorPlan types and character summaries"
```

---

### Task 2: Create director module — parsing and validation

**Files:**

- Create: `src/main/director.ts`
- Create: `src/main/director.test.ts`

**Step 1: Write failing tests for parseDirectorPlan**

Create `src/main/director.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseDirectorPlan } from './director'

const enabledIds = ['waldorf', 'statler', 'dave']

describe('parseDirectorPlan', () => {
  it('parses a valid plan', () => {
    const json = JSON.stringify({
      cast: [
        { characterId: 'waldorf', reactTo: 'conversation', note: 'go for the jugular' },
        { characterId: 'statler', reactTo: 'waldorf', note: 'pile on' },
      ],
    })
    const plan = parseDirectorPlan(json, enabledIds)
    expect(plan.cast).toHaveLength(2)
    expect(plan.cast[0].characterId).toBe('waldorf')
    expect(plan.cast[1].reactTo).toBe('waldorf')
  })

  it('returns empty cast for valid empty plan', () => {
    const json = JSON.stringify({ cast: [] })
    const plan = parseDirectorPlan(json, enabledIds)
    expect(plan.cast).toHaveLength(0)
  })

  it('filters out unknown character IDs', () => {
    const json = JSON.stringify({
      cast: [
        { characterId: 'waldorf', reactTo: 'conversation', note: 'test' },
        { characterId: 'unknown', reactTo: 'conversation', note: 'test' },
      ],
    })
    const plan = parseDirectorPlan(json, enabledIds)
    expect(plan.cast).toHaveLength(1)
    expect(plan.cast[0].characterId).toBe('waldorf')
  })

  it('returns fallback plan on malformed JSON', () => {
    const plan = parseDirectorPlan('not json at all', enabledIds)
    expect(plan.cast).toHaveLength(1)
    expect(plan.cast[0].characterId).toBe('waldorf')
    expect(plan.cast[0].reactTo).toBe('conversation')
  })

  it('returns fallback plan when cast is not an array', () => {
    const json = JSON.stringify({ cast: 'oops' })
    const plan = parseDirectorPlan(json, enabledIds)
    expect(plan.cast).toHaveLength(1)
  })

  it('replaces invalid reactTo with conversation', () => {
    const json = JSON.stringify({
      cast: [{ characterId: 'waldorf', reactTo: 'nobody', note: 'test' }],
    })
    const plan = parseDirectorPlan(json, enabledIds)
    expect(plan.cast[0].reactTo).toBe('conversation')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/dervish/CascadeProjects/PeanutGallery/.worktrees/comedy-director && npx vitest run src/main/director.test.ts`
Expected: FAIL — module `./director` not found

**Step 3: Implement parseDirectorPlan**

Create `src/main/director.ts`:

```typescript
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
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/dervish/CascadeProjects/PeanutGallery/.worktrees/comedy-director && npx vitest run src/main/director.test.ts`
Expected: PASS — all 6 tests

**Step 5: Commit**

```bash
git add src/main/director.ts src/main/director.test.ts
git commit -m "feat: add director module with plan parsing and validation"
```

---

### Task 3: Director prompt and API call

**Files:**

- Modify: `src/main/director.ts`
- Modify: `src/main/director.test.ts`

**Step 1: Write failing tests for buildDirectorMessages and callDirector**

Add to `director.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseDirectorPlan, buildDirectorMessages } from './director'
import type { Message, CharacterConfig } from '../shared/types'

// ... existing parseDirectorPlan tests stay ...

function msg(role: 'user' | 'assistant', text: string): Message {
  return { role, text, timestamp: null, index: 0 }
}

function makeRoster(): Pick<CharacterConfig, 'id' | 'name' | 'summary'>[] {
  return [
    { id: 'waldorf', name: 'Waldorf', summary: 'Savage theatre critic' },
    { id: 'statler', name: 'Statler', summary: 'Comedy partner, punchline man' },
  ]
}

describe('buildDirectorMessages', () => {
  it('includes conversation context in user message', () => {
    const messages = [msg('user', 'hello'), msg('assistant', 'hi there')]
    const result = buildDirectorMessages(messages, makeRoster(), [])
    expect(result.userMessage).toContain('[user]: hello')
    expect(result.userMessage).toContain('[assistant]: hi there')
  })

  it('includes character roster in user message', () => {
    const result = buildDirectorMessages([msg('user', 'test')], makeRoster(), [])
    expect(result.userMessage).toContain('waldorf')
    expect(result.userMessage).toContain('Savage theatre critic')
  })

  it('includes round history when provided', () => {
    const history = [
      {
        comments: [{ character: 'Waldorf', text: 'That was awful' }],
      },
    ]
    const result = buildDirectorMessages([msg('user', 'test')], makeRoster(), history)
    expect(result.userMessage).toContain('That was awful')
  })

  it('returns a system prompt with comedy director personality', () => {
    const result = buildDirectorMessages([msg('user', 'test')], makeRoster(), [])
    expect(result.systemPrompt).toContain('comedy director')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/dervish/CascadeProjects/PeanutGallery/.worktrees/comedy-director && npx vitest run src/main/director.test.ts`
Expected: FAIL — `buildDirectorMessages` not exported

**Step 3: Implement buildDirectorMessages**

Add to `director.ts`:

```typescript
import type { CharacterConfig, DirectorPlan, DirectorCastEntry } from '../shared/types'
import type { Message } from '../shared/types'

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
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/dervish/CascadeProjects/PeanutGallery/.worktrees/comedy-director && npx vitest run src/main/director.test.ts`
Expected: PASS — all tests

**Step 5: Run full test suite**

Run: `cd /Users/dervish/CascadeProjects/PeanutGallery/.worktrees/comedy-director && npm test`
Expected: PASS — 40+ tests, 0 failures

**Step 6: Commit**

```bash
git add src/main/director.ts src/main/director.test.ts
git commit -m "feat: add director prompt builder and message formatting"
```

---

### Task 4: Integrate director into CharacterEngine

This is the core change. `generateCommentary` calls the director, executes the plan, and emits comments via callback with staggered timing.

**Files:**

- Modify: `src/main/characters.ts`
- Modify: `src/main/characters.test.ts`

**Step 1: Write failing tests for the new callback-based generateCommentary**

Replace the existing `generateCommentary` describe block in `characters.test.ts` with tests for the new behaviour. Key tests:

```typescript
describe('generateCommentary', () => {
  it('calls director then emits comments via onComment callback', async () => {
    const charA = makeCharacter({ id: 'waldorf', name: 'Waldorf' })
    const engine = await createEngine([charA])

    // First call = director, second call = character
    mockCreate
      .mockResolvedValueOnce(
        apiResponse(
          JSON.stringify({
            cast: [{ characterId: 'waldorf', reactTo: 'conversation', note: 'be savage' }],
          }),
        ),
      )
      .mockResolvedValueOnce(apiResponse('Terrible show'))

    const comments: CommentEvent[] = []
    await engine.generateCommentary(
      msg('assistant', 'hello'),
      [msg('user', 'hi'), msg('assistant', 'hello')],
      'conv-1',
      (comment) => comments.push(comment),
    )

    expect(comments).toHaveLength(1)
    expect(comments[0].characterName).toBe('Waldorf')
    expect(comments[0].text).toBe('Terrible show')
    expect(mockCreate).toHaveBeenCalledTimes(2) // director + 1 character
  })

  it('emits nothing when director returns empty cast', async () => {
    const engine = await createEngine([makeCharacter()])
    mockCreate.mockResolvedValueOnce(apiResponse(JSON.stringify({ cast: [] })))

    const comments: CommentEvent[] = []
    await engine.generateCommentary(
      msg('assistant', 'hello'),
      [msg('user', 'hi')],
      'conv-1',
      (comment) => comments.push(comment),
    )

    expect(comments).toHaveLength(0)
    expect(mockCreate).toHaveBeenCalledTimes(1) // director only
  })

  it('falls back to first character on malformed director response', async () => {
    const engine = await createEngine([makeCharacter()])
    mockCreate
      .mockResolvedValueOnce(apiResponse('not json'))
      .mockResolvedValueOnce(apiResponse('Fallback comment'))

    const comments: CommentEvent[] = []
    await engine.generateCommentary(
      msg('assistant', 'hello'),
      [msg('user', 'hi')],
      'conv-1',
      (comment) => comments.push(comment),
    )

    expect(comments).toHaveLength(1)
    expect(comments[0].text).toBe('Fallback comment')
  })

  it('injects director note into character prompt', async () => {
    const engine = await createEngine([makeCharacter({ id: 'waldorf', name: 'Waldorf' })])
    mockCreate
      .mockResolvedValueOnce(
        apiResponse(
          JSON.stringify({
            cast: [
              { characterId: 'waldorf', reactTo: 'conversation', note: 'deadpan disappointment' },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(apiResponse('Sigh'))

    await engine.generateCommentary(
      msg('assistant', 'hello'),
      [msg('user', 'hi')],
      'conv-1',
      () => {},
    )

    // Check the character API call includes the director note
    const characterCall = mockCreate.mock.calls[1]
    expect(characterCall[0].messages[0].content).toContain('deadpan disappointment')
  })

  it('passes previous cast comments when reactTo targets another character', async () => {
    const charA = makeCharacter({ id: 'waldorf', name: 'Waldorf' })
    const charB = makeCharacter({ id: 'statler', name: 'Statler' })
    const engine = await createEngine([charA, charB])

    mockCreate
      .mockResolvedValueOnce(
        apiResponse(
          JSON.stringify({
            cast: [
              { characterId: 'waldorf', reactTo: 'conversation', note: 'setup' },
              { characterId: 'statler', reactTo: 'waldorf', note: 'punchline' },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(apiResponse('What a disaster'))
      .mockResolvedValueOnce(apiResponse('You said it'))

    const comments: CommentEvent[] = []
    await engine.generateCommentary(
      msg('assistant', 'hello'),
      [msg('user', 'hi')],
      'conv-1',
      (comment) => comments.push(comment),
    )

    expect(comments).toHaveLength(2)
    // Statler's prompt should reference Waldorf's comment
    const statlerCall = mockCreate.mock.calls[2]
    expect(statlerCall[0].messages[0].content).toContain('What a disaster')
  })

  it('enforces cooldown between rounds', async () => {
    const engine = await createEngine([makeCharacter()])
    mockCreate
      .mockResolvedValueOnce(
        apiResponse(
          JSON.stringify({
            cast: [{ characterId: 'test-char', reactTo: 'conversation', note: '' }],
          }),
        ),
      )
      .mockResolvedValueOnce(apiResponse('First'))

    const first: CommentEvent[] = []
    await engine.generateCommentary(
      msg('assistant', 'a'),
      [msg('user', 'q'), msg('assistant', 'a')],
      'conv-1',
      (c) => first.push(c),
    )
    expect(first).toHaveLength(1)

    const second: CommentEvent[] = []
    await engine.generateCommentary(msg('assistant', 'b'), [msg('user', 'q2')], 'conv-1', (c) =>
      second.push(c),
    )
    expect(second).toHaveLength(0)
  })

  it('prevents concurrent generation', async () => {
    const engine = await createEngine([makeCharacter()])

    let resolveDirector!: (v: unknown) => void
    mockCreate.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDirector = resolve
      }),
    )

    const firstPromise = engine.generateCommentary(
      msg('assistant', 'a'),
      [msg('user', 'q')],
      'conv-1',
      () => {},
    )

    const second: CommentEvent[] = []
    await engine.generateCommentary(msg('assistant', 'b'), [msg('user', 'q2')], 'conv-1', (c) =>
      second.push(c),
    )
    expect(second).toHaveLength(0)

    resolveDirector(apiResponse(JSON.stringify({ cast: [] })))
    await firstPromise
  })

  it('skips disabled characters in director plan', async () => {
    const engine = await createEngine([makeCharacter({ enabled: false })])

    const comments: CommentEvent[] = []
    await engine.generateCommentary(msg('assistant', 'hello'), [msg('user', 'hi')], 'conv-1', (c) =>
      comments.push(c),
    )

    expect(comments).toHaveLength(0)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('continues with next character when one fails', async () => {
    const charA = makeCharacter({ id: 'waldorf', name: 'Waldorf' })
    const charB = makeCharacter({ id: 'statler', name: 'Statler' })
    const engine = await createEngine([charA, charB])

    mockCreate
      .mockResolvedValueOnce(
        apiResponse(
          JSON.stringify({
            cast: [
              { characterId: 'waldorf', reactTo: 'conversation', note: '' },
              { characterId: 'statler', reactTo: 'conversation', note: '' },
            ],
          }),
        ),
      )
      .mockRejectedValueOnce(new Error('API error'))
      .mockResolvedValueOnce(apiResponse('Statler survives'))

    const comments: CommentEvent[] = []
    await engine.generateCommentary(msg('assistant', 'hello'), [msg('user', 'hi')], 'conv-1', (c) =>
      comments.push(c),
    )

    expect(comments).toHaveLength(1)
    expect(comments[0].characterName).toBe('Statler')
  })
})
```

Also import `CommentEvent` at the top of the test file:

```typescript
import type { Message, CharacterConfig, CommentEvent } from '../shared/types'
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/dervish/CascadeProjects/PeanutGallery/.worktrees/comedy-director && npx vitest run src/main/characters.test.ts`
Expected: FAIL — signature mismatch (no `onComment` parameter)

**Step 3: Rewrite generateCommentary in characters.ts**

Replace the `generateCommentary` method and add director integration. Key changes:

1. Import `parseDirectorPlan`, `buildDirectorMessages`, `RoundHistory` from `./director`
2. Add `roundHistory: RoundHistory[]` private field (max 3)
3. Add `resetHistory()` public method
4. Replace the character loop with: director call → plan parse → sequential execution with `onComment` callback
5. Remove `reactionChance`/`reactionToOtherChance` usage
6. Add 1-3s random delay between characters (via a `private delay()` method that tests can mock)

Updated `generateCommentary` signature:

```typescript
async generateCommentary(
  _newMessage: Message,
  recentMessages: Message[],
  conversationId: string,
  onComment: (comment: CommentEvent) => void,
): Promise<void> {
```

Full implementation of the new method:

```typescript
async generateCommentary(
  _newMessage: Message,
  recentMessages: Message[],
  conversationId: string,
  onComment: (comment: CommentEvent) => void,
): Promise<void> {
  const now = Date.now()
  if (this.generating || now - this.lastCommentTime < this.cooldownMs) {
    return
  }

  const enabled = this.characters.filter((c) => c.enabled !== false)
  if (enabled.length === 0) return

  this.generating = true
  this.roundCounter++
  const roundId = `round-${this.roundCounter}`
  const roundComments: { character: string; text: string }[] = []

  try {
    const context = recentMessages.slice(-MAX_CONTEXT_MESSAGES).map((m) => ({
      ...m,
      text:
        m.text.length > MAX_MESSAGE_CHARS ? m.text.slice(0, MAX_MESSAGE_CHARS) + '...' : m.text,
    }))

    // Call the director
    const roster = enabled.map((c) => ({ id: c.id, name: c.name, summary: c.summary }))
    const enabledIds = enabled.map((c) => c.id)
    let plan: DirectorPlan

    try {
      const { systemPrompt, userMessage } = buildDirectorMessages(
        context,
        roster,
        this.roundHistory,
      )
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 200,
        temperature: 0.8,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })
      const block = response.content[0]
      plan = parseDirectorPlan(block.type === 'text' ? block.text : '', enabledIds)
    } catch (err) {
      console.error('[Director] Error, falling back:', err)
      plan = { cast: [{ characterId: enabledIds[0], reactTo: 'conversation', note: '' }] }
    }

    if (plan.cast.length === 0) return

    // Execute the cast plan
    const commentsByCharId: Record<string, string> = {}

    for (let i = 0; i < plan.cast.length; i++) {
      const entry = plan.cast[i]
      const character = enabled.find((c) => c.id === entry.characterId)
      if (!character) continue

      // Delay between characters (not before the first one)
      if (i > 0) {
        await this.jitterDelay()
      }

      try {
        const text = await this.generateDirectedComment(
          character,
          context,
          entry,
          commentsByCharId,
        )
        if (text) {
          commentsByCharId[character.id] = text
          roundComments.push({ character: character.name, text })

          const event: CommentEvent = {
            id: `${roundId}-${character.id}`,
            conversationId,
            characterId: character.id,
            characterName: character.name,
            avatar: character.avatar || '🎤',
            color: character.color,
            text,
            roundId,
            timestamp: Date.now(),
          }
          onComment(event)
        }
      } catch (err) {
        console.error(`[${character.name}] API error:`, err)
      }
    }

    if (roundComments.length > 0) {
      this.lastCommentTime = Date.now()
    }

    // Track round history (rolling 3)
    this.roundHistory.push({ comments: roundComments })
    if (this.roundHistory.length > 3) {
      this.roundHistory.shift()
    }
  } finally {
    this.generating = false
  }
}
```

Add the new private helper methods:

```typescript
private async generateDirectedComment(
  character: CharacterConfig,
  recentMessages: Message[],
  entry: DirectorCastEntry,
  commentsByCharId: Record<string, string>,
): Promise<string> {
  const conversationContext = recentMessages.map((m) => `[${m.role}]: ${m.text}`).join('\n\n')

  let userPrompt = `Here's the recent conversation you're watching:\n\n${conversationContext}`

  if (entry.reactTo !== 'conversation' && commentsByCharId[entry.reactTo]) {
    const targetChar = this.characters.find((c) => c.id === entry.reactTo)
    const targetName = targetChar?.name || entry.reactTo
    userPrompt += `\n\n${targetName} just said: "${commentsByCharId[entry.reactTo]}"\n\nRiff off what they said.`
  } else {
    userPrompt += `\n\nGive your commentary on this conversation.`
  }

  if (entry.note) {
    userPrompt += `\n\n[Director's note: ${entry.note}]`
  }

  const response = await this.client.messages.create({
    model: MODEL,
    max_tokens: character.maxTokens,
    temperature: character.temperature,
    system: character.systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const block = response.content[0]
  if (block.type === 'text') {
    return block.text.trim()
  }
  return ''
}

protected async jitterDelay(): Promise<void> {
  const ms = 1000 + Math.random() * 2000 // 1-3 seconds
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

Add to class fields:

```typescript
private roundHistory: RoundHistory[] = []
```

Add `resetHistory` method:

```typescript
resetHistory(): void {
  this.roundHistory = []
}
```

Add imports at top of `characters.ts`:

```typescript
import { parseDirectorPlan, buildDirectorMessages } from './director'
import type { RoundHistory } from './director'
import type { DirectorPlan, DirectorCastEntry } from '../shared/types'
```

Remove the old `generateComment` private method (replaced by `generateDirectedComment`).

**Step 4: Mock jitterDelay in tests**

In `characters.test.ts`, after creating the engine, spy on jitterDelay to make it instant:

```typescript
async function createEngine(characters: CharacterConfig[]) {
  const { CharacterEngine } = await import('./characters')
  const engine = new CharacterEngine('test-key', characters)
  // Make jitter instant in tests
  vi.spyOn(engine as any, 'jitterDelay').mockResolvedValue(undefined)
  return engine
}
```

**Step 5: Run tests to verify they pass**

Run: `cd /Users/dervish/CascadeProjects/PeanutGallery/.worktrees/comedy-director && npx vitest run src/main/characters.test.ts`
Expected: PASS — all tests

**Step 6: Run full test suite**

Run: `cd /Users/dervish/CascadeProjects/PeanutGallery/.worktrees/comedy-director && npm test`
Expected: PASS

**Step 7: Commit**

```bash
git add src/main/characters.ts src/main/characters.test.ts
git commit -m "feat: integrate comedy director into CharacterEngine"
```

---

### Task 5: Update index.ts caller

**Files:**

- Modify: `src/main/index.ts`

**Step 1: Update handleNewMessages to use onComment callback**

In `src/main/index.ts`, replace the `generateCommentary` call in `handleNewMessages` (around line 93-114):

Change from:

```typescript
engine
  .generateCommentary(lastMsg, recentMessages, convId)
  .then((comments) => {
    for (const comment of comments) {
      if (comment.conversationId !== currentConversationId) {
        console.log(`[Commentary] Dropping stale comment from ${comment.characterName} (old conv)`)
        continue
      }
      console.log(`[${comment.characterName}] "${comment.text}"`)
      mainWindow?.webContents.send('comment:new', comment)
    }
  })
  .catch((err) => {
    console.error('[Commentary] Error:', err)
  })
```

To:

```typescript
engine
  .generateCommentary(lastMsg, recentMessages, convId, (comment) => {
    if (comment.conversationId !== currentConversationId) {
      console.log(`[Commentary] Dropping stale comment from ${comment.characterName} (old conv)`)
      return
    }
    console.log(`[${comment.characterName}] "${comment.text}"`)
    mainWindow?.webContents.send('comment:new', comment)
  })
  .catch((err) => {
    console.error('[Commentary] Error:', err)
  })
```

**Step 2: Add resetHistory call on conversation switch**

In the conversation switch block (around line 126), after `recentMessages = []` add:

```typescript
engine?.resetHistory()
```

**Step 3: Run typecheck**

Run: `cd /Users/dervish/CascadeProjects/PeanutGallery/.worktrees/comedy-director && npx tsc --noEmit`
Expected: PASS

**Step 4: Run full test suite**

Run: `cd /Users/dervish/CascadeProjects/PeanutGallery/.worktrees/comedy-director && npm test`
Expected: PASS — all tests

**Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: wire up callback-based commentary with director in main process"
```

---

### Task 6: Update CLAUDE.md and lint

**Files:**

- Modify: `CLAUDE.md`

**Step 1: Update CLAUDE.md file map**

Add `src/main/director.ts` entry after the `src/main/characters.ts` line:

```
src/main/director.ts - Comedy Director: decides who speaks, order, and creative direction per round
```

**Step 2: Update architecture section**

In the Character Engine description, update to mention the director:

```
Manages AI personas (Waldorf, Statler, Dave). A Comedy Director (single Haiku call) decides who speaks each round, in what order, and what they react to — or whether everyone stays silent. Characters are then called sequentially per the director's plan, with 1-3s jitter between emissions.
```

**Step 3: Run lint and format**

Run: `cd /Users/dervish/CascadeProjects/PeanutGallery/.worktrees/comedy-director && npm run lint && npm run format`
Expected: PASS (or auto-fixable)

**Step 4: Run full test suite one final time**

Run: `cd /Users/dervish/CascadeProjects/PeanutGallery/.worktrees/comedy-director && npm test`
Expected: PASS — all tests

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for comedy director architecture"
```

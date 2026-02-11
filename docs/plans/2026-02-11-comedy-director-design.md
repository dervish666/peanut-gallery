# Comedy Director — Design

## Summary

Replace the fixed-order character iteration and dice-roll gates (`reactionChance` / `reactionToOtherChance`) with a **Comedy Director** — a single Haiku call at the start of each commentary round that decides who speaks, in what order, what they react to, and provides creative direction notes. The director understands comedy timing, can choose silence over forced commentary, and varies the cast across rounds.

## Director Role & Input

The Director fires once per commentary round (after the differ settles a new message and cooldown clears). It receives:

- **Recent conversation** — last 8 messages, trimmed to 500 chars each (same context characters see)
- **Character roster** — each enabled character's ID, name, and a one-line personality summary
- **Round history** — last 3 rounds of commentary (cast plans + generated comments), reset on conversation switch

It outputs a structured JSON plan:

```typescript
interface DirectorPlan {
  cast: Array<{
    characterId: string
    reactTo: 'conversation' | string  // string = characterId to riff on
    note: string                       // 5-10 word creative direction
  }>
}
```

Empty `cast` array = nobody talks this round.

## Director Prompt Personality

The director is an opinionated comedy director, not a neutral router:

- **Comedy instincts** — knows silence can be funnier than a forced joke; recognises setups begging for punchlines; knows when a topic is played out
- **Cast management** — understands each character's strengths and plays to them rather than assigning randomly
- **Pacing awareness** — uses round history to vary cast size, order, and composition; avoids patterns like "Waldorf always goes first" or "all three every time"
- **Direction notes** — short nudges (5-10 words) injected into character prompts as `[Director's note: ...]`; guides tone without scripting content

Temperature: ~0.8. Output: valid JSON matching the schema above.

## Integration with CharacterEngine

### Flow

1. **Director call** — send conversation context, roster, round history; parse the cast plan
2. **Execute sequentially** — for each cast entry, call `generateComment` with:
   - The director's note injected into the prompt
   - If `reactTo` is a characterId, include that character's line as the specific target (not all previous comments)
3. **Emit individually** — send each `CommentEvent` via callback as it's generated, with 1-3 seconds random jitter between emissions (Haiku's natural latency provides additional spacing)
4. **Track history** — push the round's plan + comments into a rolling 3-round buffer

### Method Signature Change

`generateCommentary` changes from returning `Promise<CommentEvent[]>` to accepting an `onComment: (event: CommentEvent) => void` callback, since comments now emit over time.

### Removed Mechanics

- `reactionChance` and `reactionToOtherChance` are no longer used (fields stay on `CharacterConfig` but are ignored — clean removal in a follow-up)
- Fixed character array order no longer determines speaking order

## API Cost

- **Before:** 1-3 Haiku calls per round (one per character passing dice roll)
- **After:** 1 director call (~100 tokens out) + 0-3 character calls = 1-4 calls per round
- **Net:** ~1 extra Haiku call per round (fractions of a cent); rounds where the director says "skip" save money vs old dice rolls firing on dull messages

## Error Handling

Principle: **the director is an enhancement, not a gate.** If it breaks, commentary still works.

- **Malformed JSON** — fall back to current behaviour: first enabled character reacts to conversation
- **Unknown/disabled character ID** — skip that cast entry
- **Character generation failure** — continue with next cast member, don't abort the round
- **Director timeout** — fall back to single-character mode
- No retries on any failure

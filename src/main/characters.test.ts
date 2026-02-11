import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Message, CharacterConfig, CommentEvent } from '../shared/types'

// Store the mock function at module level
const mockCreate = vi.fn()

// Mock the Anthropic SDK — must use a class so `new Anthropic()` works
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate }
    },
  }
})

function makeCharacter(overrides: Partial<CharacterConfig> = {}): CharacterConfig {
  return {
    id: 'test-char',
    name: 'TestChar',
    avatar: '🎭',
    color: '#FF0000',
    enabled: true,
    summary: 'A test character',
    systemPrompt: 'You are a test character.',
    temperature: 0.9,
    maxTokens: 50,
    reactionChance: 1.0,
    reactionToOtherChance: 1.0,
    ...overrides,
  }
}

function msg(role: 'user' | 'assistant', text: string): Message {
  return { role, text, timestamp: null, index: 0 }
}

function apiResponse(text: string): { content: { type: string; text: string }[] } {
  return { content: [{ type: 'text', text }] }
}

function directorPlan(cast: { characterId: string; reactTo?: string; note?: string }[]): {
  content: { type: string; text: string }[]
} {
  return apiResponse(
    JSON.stringify({
      cast: cast.map((c) => ({
        characterId: c.characterId,
        reactTo: c.reactTo || 'conversation',
        note: c.note || '',
      })),
    }),
  )
}

describe('CharacterEngine', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue(apiResponse('Funny comment'))
  })

  // Import dynamically after mock is set up
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async function createEngine(characters: CharacterConfig[]) {
    const { CharacterEngine } = await import('./characters')
    const engine = new CharacterEngine('test-key', characters)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(engine as any, 'jitterDelay').mockResolvedValue(undefined)
    return engine
  }

  describe('generateCommentary', () => {
    it('calls director then emits comments via onComment callback', async () => {
      const waldorf = makeCharacter({ id: 'waldorf', name: 'Waldorf' })
      const engine = await createEngine([waldorf])

      // First call = director, second call = character
      mockCreate
        .mockResolvedValueOnce(directorPlan([{ characterId: 'waldorf' }]))
        .mockResolvedValueOnce(apiResponse('What a disaster!'))

      const comments: CommentEvent[] = []
      await engine.generateCommentary(
        msg('assistant', 'hello'),
        [msg('user', 'hi')],
        'conv-1',
        (c) => comments.push(c),
      )

      expect(comments).toHaveLength(1)
      expect(comments[0].characterName).toBe('Waldorf')
      expect(comments[0].text).toBe('What a disaster!')
      expect(comments[0].conversationId).toBe('conv-1')
      expect(mockCreate).toHaveBeenCalledTimes(2) // director + character
    })

    it('emits nothing when director returns empty cast', async () => {
      const engine = await createEngine([makeCharacter()])

      mockCreate.mockResolvedValueOnce(directorPlan([]))

      const comments: CommentEvent[] = []
      await engine.generateCommentary(
        msg('assistant', 'hello'),
        [msg('user', 'hi')],
        'conv-1',
        (c) => comments.push(c),
      )

      expect(comments).toHaveLength(0)
      expect(mockCreate).toHaveBeenCalledTimes(1) // only director
    })

    it('falls back to first character on malformed director response', async () => {
      const engine = await createEngine([makeCharacter({ id: 'waldorf', name: 'Waldorf' })])

      // Director returns garbage, character returns text
      mockCreate
        .mockResolvedValueOnce(apiResponse('not json at all'))
        .mockResolvedValueOnce(apiResponse('Fallback joke'))

      const comments: CommentEvent[] = []
      await engine.generateCommentary(
        msg('assistant', 'hello'),
        [msg('user', 'hi')],
        'conv-1',
        (c) => comments.push(c),
      )

      expect(comments).toHaveLength(1)
      expect(comments[0].text).toBe('Fallback joke')
    })

    it('injects director note into character prompt', async () => {
      const engine = await createEngine([makeCharacter({ id: 'waldorf', name: 'Waldorf' })])

      mockCreate
        .mockResolvedValueOnce(
          directorPlan([{ characterId: 'waldorf', note: 'deadpan disappointment' }]),
        )
        .mockResolvedValueOnce(apiResponse('Meh.'))

      const comments: CommentEvent[] = []
      await engine.generateCommentary(
        msg('assistant', 'hello'),
        [msg('user', 'hi')],
        'conv-1',
        (c) => comments.push(c),
      )

      expect(comments).toHaveLength(1)
      // The character API call is the second one (index 1)
      const charCall = mockCreate.mock.calls[1]
      const userMessage = charCall[0].messages[0].content
      expect(userMessage).toContain("[Director's note: deadpan disappointment]")
    })

    it('passes previous cast comments when reactTo targets another character', async () => {
      const charA = makeCharacter({ id: 'waldorf', name: 'Waldorf' })
      const charB = makeCharacter({ id: 'statler', name: 'Statler' })
      const engine = await createEngine([charA, charB])

      mockCreate
        // Director plan: waldorf speaks, then statler reacts to waldorf
        .mockResolvedValueOnce(
          directorPlan([
            { characterId: 'waldorf' },
            { characterId: 'statler', reactTo: 'waldorf' },
          ]),
        )
        // Waldorf's response
        .mockResolvedValueOnce(apiResponse('That code was terrible!'))
        // Statler's response
        .mockResolvedValueOnce(apiResponse('Even worse than his last one!'))

      const comments: CommentEvent[] = []
      await engine.generateCommentary(
        msg('assistant', 'hello'),
        [msg('user', 'hi')],
        'conv-1',
        (c) => comments.push(c),
      )

      expect(comments).toHaveLength(2)

      // Statler's call (third mockCreate call, index 2) should reference Waldorf's comment
      const statlerCall = mockCreate.mock.calls[2]
      const userMessage = statlerCall[0].messages[0].content
      expect(userMessage).toContain('That code was terrible!')
      expect(userMessage).toContain('Waldorf')
    })

    it('enforces cooldown between rounds', async () => {
      const engine = await createEngine([makeCharacter({ id: 'waldorf', name: 'Waldorf' })])

      mockCreate
        .mockResolvedValueOnce(directorPlan([{ characterId: 'waldorf' }]))
        .mockResolvedValueOnce(apiResponse('First joke'))

      const first: CommentEvent[] = []
      await engine.generateCommentary(
        msg('assistant', 'a'),
        [msg('user', 'q'), msg('assistant', 'a')],
        'conv-1',
        (c) => first.push(c),
      )
      expect(first).toHaveLength(1)

      // Immediately try again — should be blocked by cooldown
      const second: CommentEvent[] = []
      await engine.generateCommentary(
        msg('assistant', 'b'),
        [msg('user', 'q2'), msg('assistant', 'b')],
        'conv-1',
        (c) => second.push(c),
      )
      expect(second).toHaveLength(0)
    })

    it('prevents concurrent generation', async () => {
      const engine = await createEngine([makeCharacter({ id: 'waldorf', name: 'Waldorf' })])

      // Make director call hang
      let resolveFirst!: (v: unknown) => void
      mockCreate.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
      )

      const first: CommentEvent[] = []
      const firstPromise = engine.generateCommentary(
        msg('assistant', 'a'),
        [msg('user', 'q')],
        'conv-1',
        (c) => first.push(c),
      )

      // Second call while first is in-flight
      const second: CommentEvent[] = []
      await engine.generateCommentary(msg('assistant', 'b'), [msg('user', 'q2')], 'conv-1', (c) =>
        second.push(c),
      )
      expect(second).toHaveLength(0) // Blocked by generating flag

      resolveFirst(directorPlan([{ characterId: 'waldorf' }]))
      await firstPromise
    })

    it('skips disabled characters', async () => {
      const engine = await createEngine([makeCharacter({ enabled: false })])

      const comments: CommentEvent[] = []
      await engine.generateCommentary(
        msg('assistant', 'hello'),
        [msg('user', 'hi')],
        'conv-1',
        (c) => comments.push(c),
      )

      expect(comments).toHaveLength(0)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('continues with next character when one fails', async () => {
      const charA = makeCharacter({ id: 'waldorf', name: 'Waldorf' })
      const charB = makeCharacter({ id: 'statler', name: 'Statler' })
      const engine = await createEngine([charA, charB])

      mockCreate
        // Director plan: both characters
        .mockResolvedValueOnce(
          directorPlan([{ characterId: 'waldorf' }, { characterId: 'statler' }]),
        )
        // Waldorf API call fails
        .mockRejectedValueOnce(new Error('API error'))
        // Statler succeeds
        .mockResolvedValueOnce(apiResponse('Statler saves the day'))

      const comments: CommentEvent[] = []
      await engine.generateCommentary(
        msg('assistant', 'hello'),
        [msg('user', 'hi')],
        'conv-1',
        (c) => comments.push(c),
      )

      expect(comments).toHaveLength(1)
      expect(comments[0].characterName).toBe('Statler')
    })
  })

  describe('generateIntro', () => {
    it('generates an intro comment from a random enabled character', async () => {
      mockCreate.mockResolvedValueOnce(apiResponse('Welcome to the show...'))
      const engine = await createEngine([makeCharacter()])

      const intro = await engine.generateIntro('Test Conversation', [], 'conv-1')

      expect(intro).not.toBeNull()
      expect(intro!.text).toBe('Welcome to the show...')
      expect(intro!.conversationId).toBe('conv-1')
      expect(intro!.id).toContain('intro')
    })

    it('returns null when no characters are enabled', async () => {
      const engine = await createEngine([makeCharacter({ enabled: false })])
      const intro = await engine.generateIntro('Test', [], 'conv-1')
      expect(intro).toBeNull()
    })

    it('returns null on API error', async () => {
      mockCreate.mockRejectedValueOnce(new Error('fail'))
      const engine = await createEngine([makeCharacter()])
      const intro = await engine.generateIntro('Test', [], 'conv-1')
      expect(intro).toBeNull()
    })
  })

  describe('roastTitle', () => {
    it('returns a roast string', async () => {
      mockCreate.mockResolvedValueOnce(apiResponse('Sounds awful'))
      const engine = await createEngine([makeCharacter()])
      const roast = await engine.roastTitle('My Amazing Project')
      expect(roast).toBe('Sounds awful')
    })

    it('returns null on API error', async () => {
      mockCreate.mockRejectedValueOnce(new Error('fail'))
      const engine = await createEngine([makeCharacter()])
      const roast = await engine.roastTitle('Test')
      expect(roast).toBeNull()
    })
  })

  describe('setCharacters', () => {
    it('updates the character list', async () => {
      const engine = await createEngine([makeCharacter({ id: 'old' })])
      engine.setCharacters([makeCharacter({ id: 'new', name: 'NewChar' })])

      // Director returns plan with new character
      mockCreate
        .mockResolvedValueOnce(directorPlan([{ characterId: 'new' }]))
        .mockResolvedValueOnce(apiResponse('New char speaks'))

      const comments: CommentEvent[] = []
      await engine.generateCommentary(
        msg('assistant', 'hello'),
        [msg('user', 'hi')],
        'conv-1',
        (c) => comments.push(c),
      )

      expect(comments).toHaveLength(1)
      expect(comments[0].characterId).toBe('new')
      expect(comments[0].characterName).toBe('NewChar')
    })
  })
})

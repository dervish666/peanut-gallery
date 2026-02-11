import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Message, CharacterConfig } from '../shared/types'

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

function apiResponse(text: string) {
  return { content: [{ type: 'text', text }] }
}

describe('CharacterEngine', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue(apiResponse('Funny comment'))
  })

  // Import dynamically after mock is set up
  async function createEngine(characters: CharacterConfig[]) {
    const { CharacterEngine } = await import('./characters')
    return new CharacterEngine('test-key', characters)
  }

  describe('generateCommentary', () => {
    it('generates comments from enabled characters', async () => {
      const engine = await createEngine([makeCharacter()])
      const comments = await engine.generateCommentary(
        msg('assistant', 'hello'),
        [msg('user', 'hi'), msg('assistant', 'hello')],
        'conv-1',
      )

      expect(comments).toHaveLength(1)
      expect(comments[0].characterName).toBe('TestChar')
      expect(comments[0].text).toBe('Funny comment')
      expect(comments[0].conversationId).toBe('conv-1')
      expect(mockCreate).toHaveBeenCalledOnce()
    })

    it('skips disabled characters', async () => {
      const engine = await createEngine([makeCharacter({ enabled: false })])
      const comments = await engine.generateCommentary(
        msg('assistant', 'hello'),
        [msg('user', 'hi')],
        'conv-1',
      )

      expect(comments).toHaveLength(0)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('enforces cooldown between rounds', async () => {
      const engine = await createEngine([makeCharacter()])

      const first = await engine.generateCommentary(
        msg('assistant', 'a'),
        [msg('user', 'q'), msg('assistant', 'a')],
        'conv-1',
      )
      expect(first).toHaveLength(1)

      // Immediately try again — should be blocked by cooldown
      const second = await engine.generateCommentary(
        msg('assistant', 'b'),
        [msg('user', 'q2'), msg('assistant', 'b')],
        'conv-1',
      )
      expect(second).toHaveLength(0)
    })

    it('prevents concurrent generation', async () => {
      const engine = await createEngine([makeCharacter()])

      // Make API call hang
      let resolveFirst!: (v: unknown) => void
      mockCreate.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
      )

      const firstPromise = engine.generateCommentary(
        msg('assistant', 'a'),
        [msg('user', 'q')],
        'conv-1',
      )

      // Second call while first is in-flight
      const second = await engine.generateCommentary(
        msg('assistant', 'b'),
        [msg('user', 'q2')],
        'conv-1',
      )
      expect(second).toHaveLength(0) // Blocked by generating flag

      resolveFirst(apiResponse('response'))
      await firstPromise
    })

    it('respects reactionChance gate', async () => {
      // Set reactionChance to 0 — should never react
      const engine = await createEngine([makeCharacter({ reactionChance: 0 })])
      const comments = await engine.generateCommentary(
        msg('assistant', 'hello'),
        [msg('user', 'hi')],
        'conv-1',
      )

      expect(comments).toHaveLength(0)
    })

    it('chains characters with previous comments context', async () => {
      const charA = makeCharacter({ id: 'a', name: 'CharA', reactionChance: 1, reactionToOtherChance: 1 })
      const charB = makeCharacter({ id: 'b', name: 'CharB', reactionChance: 1, reactionToOtherChance: 1 })
      const engine = await createEngine([charA, charB])

      mockCreate
        .mockResolvedValueOnce(apiResponse('Comment from A'))
        .mockResolvedValueOnce(apiResponse('Comment from B'))

      const comments = await engine.generateCommentary(
        msg('assistant', 'hello'),
        [msg('user', 'hi')],
        'conv-1',
      )

      expect(comments).toHaveLength(2)

      // Second API call should include CharA's comment in the prompt
      const secondCall = mockCreate.mock.calls[1]
      const userMessage = secondCall[0].messages[0].content
      expect(userMessage).toContain('CharA')
      expect(userMessage).toContain('Comment from A')
    })

    it('truncates long messages in context', async () => {
      const engine = await createEngine([makeCharacter()])
      const longText = 'x'.repeat(600)

      await engine.generateCommentary(
        msg('assistant', 'reply'),
        [msg('user', longText)],
        'conv-1',
      )

      const call = mockCreate.mock.calls[0]
      const userMessage = call[0].messages[0].content
      // Should be truncated to 500 chars + '...'
      expect(userMessage).not.toContain('x'.repeat(501))
      expect(userMessage).toContain('...')
    })

    it('handles API errors for individual characters gracefully', async () => {
      const charA = makeCharacter({ id: 'a', name: 'CharA' })
      const charB = makeCharacter({ id: 'b', name: 'CharB' })
      const engine = await createEngine([charA, charB])

      mockCreate
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce(apiResponse('B still works'))

      const comments = await engine.generateCommentary(
        msg('assistant', 'hello'),
        [msg('user', 'hi')],
        'conv-1',
      )

      // CharA fails, CharB succeeds
      expect(comments).toHaveLength(1)
      expect(comments[0].characterName).toBe('CharB')
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

      const comments = await engine.generateCommentary(
        msg('assistant', 'hello'),
        [msg('user', 'hi')],
        'conv-1',
      )

      expect(comments).toHaveLength(1)
      expect(comments[0].characterId).toBe('new')
      expect(comments[0].characterName).toBe('NewChar')
    })
  })
})

import { describe, it, expect } from 'vitest'
import { parseDirectorPlan, buildDirectorMessages } from './director'
import type { Message, CharacterConfig } from '../shared/types'

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

  it('strips markdown code fences from JSON response', () => {
    const json = '```json\n' + JSON.stringify({
      cast: [
        { characterId: 'waldorf', reactTo: 'conversation', note: 'test' },
        { characterId: 'statler', reactTo: 'waldorf', note: 'pile on' },
      ],
    }) + '\n```'
    const plan = parseDirectorPlan(json, enabledIds)
    expect(plan.cast).toHaveLength(2)
    expect(plan.cast[0].characterId).toBe('waldorf')
    expect(plan.cast[1].characterId).toBe('statler')
  })

  it('replaces invalid reactTo with conversation', () => {
    const json = JSON.stringify({
      cast: [{ characterId: 'waldorf', reactTo: 'nobody', note: 'test' }],
    })
    const plan = parseDirectorPlan(json, enabledIds)
    expect(plan.cast[0].reactTo).toBe('conversation')
  })
})

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

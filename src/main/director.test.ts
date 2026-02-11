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

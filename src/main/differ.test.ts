import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MessageDiffer } from './differ'
import type { Message } from '../shared/types'

function msg(role: 'user' | 'assistant', text: string, index = 0): Message {
  return { role, text, timestamp: null, index }
}

describe('MessageDiffer', () => {
  let differ: MessageDiffer

  beforeEach(() => {
    vi.useFakeTimers()
    differ = new MessageDiffer()
  })

  afterEach(() => {
    differ.destroy()
    vi.useRealTimers()
  })

  describe('initial diff (first call)', () => {
    it('returns last 3 messages as initial context', () => {
      const messages = [
        msg('user', 'a', 0),
        msg('assistant', 'b', 1),
        msg('user', 'c', 2),
        msg('assistant', 'd', 3),
      ]
      const result = differ.diff('title', messages)
      expect(result).toHaveLength(3)
      expect(result[0].text).toBe('b')
      expect(result[1].text).toBe('c')
      expect(result[2].text).toBe('d')
    })

    it('returns all messages when fewer than 3', () => {
      const messages = [msg('user', 'hello', 0)]
      const result = differ.diff('title', messages)
      expect(result).toHaveLength(1)
      expect(result[0].text).toBe('hello')
    })

    it('returns empty for empty conversation', () => {
      const result = differ.diff('title', [])
      expect(result).toHaveLength(0)
    })
  })

  describe('detecting new messages', () => {
    it('returns new user messages immediately', () => {
      const initial = [msg('user', 'hello', 0)]
      differ.diff('title', initial)

      const updated = [...initial, msg('assistant', 'hi', 1), msg('user', 'how are you', 2)]
      const result = differ.diff('title', updated)
      // User message is emitted immediately, assistant message enters settling
      expect(result).toEqual([msg('user', 'how are you', 2)])
    })

    it('does not emit assistant messages immediately (they settle)', () => {
      differ.diff('title', [msg('user', 'hello', 0)])

      const updated = [msg('user', 'hello', 0), msg('assistant', 'response', 1)]
      const result = differ.diff('title', updated)
      expect(result).toHaveLength(0)
    })

    it('returns nothing when no new messages', () => {
      const messages = [msg('user', 'hello', 0)]
      differ.diff('title', messages)
      const result = differ.diff('title', messages)
      expect(result).toHaveLength(0)
    })
  })

  describe('conversation switch', () => {
    it('detects switch via title change and returns context', () => {
      differ.diff('conv-1', [msg('user', 'a', 0), msg('assistant', 'b', 1)])
      const result = differ.diff('conv-2', [msg('user', 'x', 0), msg('assistant', 'y', 1)])
      expect(result).toHaveLength(2)
      expect(result[0].text).toBe('x')
      expect(result[1].text).toBe('y')
    })

    it('does NOT treat message count drop as a conversation switch', () => {
      const full = [msg('user', 'a', 0), msg('assistant', 'b', 1), msg('user', 'c', 2)]
      differ.diff('title', full)

      // Simulates a transient AX glitch returning fewer elements
      const partial = [msg('user', 'a', 0)]
      const result = differ.diff('title', partial)
      expect(result).toHaveLength(0) // No new messages, same title
    })

    it('resets settling on conversation switch', () => {
      const settled = vi.fn()
      differ.onMessageSettled(settled)

      // Start settling an assistant message
      differ.diff('conv-1', [msg('user', 'a', 0)])
      differ.diff('conv-1', [msg('user', 'a', 0), msg('assistant', 'streaming...', 1)])

      // Switch conversation before settle timer fires
      differ.diff('conv-2', [msg('user', 'new convo', 0)])
      vi.advanceTimersByTime(3000)

      expect(settled).not.toHaveBeenCalled()
    })
  })

  describe('settling / streaming detection', () => {
    it('emits assistant message via onMessageSettled after 2s of stability', () => {
      const settled = vi.fn()
      differ.onMessageSettled(settled)

      differ.diff('title', [msg('user', 'hello', 0)])
      differ.diff('title', [msg('user', 'hello', 0), msg('assistant', 'final response', 1)])

      // Not settled yet
      expect(settled).not.toHaveBeenCalled()

      vi.advanceTimersByTime(2000)
      expect(settled).toHaveBeenCalledOnce()
      expect(settled).toHaveBeenCalledWith(msg('assistant', 'final response', 1))
    })

    it('restarts settle timer when text changes (streaming)', () => {
      const settled = vi.fn()
      differ.onMessageSettled(settled)

      const m0 = msg('user', 'hello', 0)
      differ.diff('title', [m0])
      differ.diff('title', [m0, msg('assistant', 'partial', 1)])

      // 1.5s in, text changes — should restart timer
      vi.advanceTimersByTime(1500)
      differ.diff('title', [m0, msg('assistant', 'partial response complete', 1)])

      // Original 2s window would have fired, but timer was restarted
      vi.advanceTimersByTime(600)
      expect(settled).not.toHaveBeenCalled()

      // Now wait the full 2s from the restart
      vi.advanceTimersByTime(1400)
      expect(settled).toHaveBeenCalledOnce()
      expect(settled.mock.calls[0][0].text).toBe('partial response complete')
    })

    it('does not start settle timer for "Thinking" messages', () => {
      const settled = vi.fn()
      differ.onMessageSettled(settled)

      differ.diff('title', [msg('user', 'hello', 0)])
      differ.diff('title', [msg('user', 'hello', 0), msg('assistant', 'Thinking about this...', 1)])

      vi.advanceTimersByTime(5000)
      expect(settled).not.toHaveBeenCalled()
    })

    it('settles after Thinking transitions to real response', () => {
      const settled = vi.fn()
      differ.onMessageSettled(settled)

      const m0 = msg('user', 'hello', 0)
      differ.diff('title', [m0])
      differ.diff('title', [m0, msg('assistant', 'Thinking about this...', 1)])

      vi.advanceTimersByTime(1000)
      // Text changes from Thinking to real response
      differ.diff('title', [m0, msg('assistant', 'Here is my answer', 1)])

      vi.advanceTimersByTime(2000)
      expect(settled).toHaveBeenCalledOnce()
      expect(settled.mock.calls[0][0].text).toBe('Here is my answer')
    })
  })

  describe('destroy', () => {
    it('clears pending settle timer and callback', () => {
      const settled = vi.fn()
      differ.onMessageSettled(settled)

      differ.diff('title', [msg('user', 'hello', 0)])
      differ.diff('title', [msg('user', 'hello', 0), msg('assistant', 'response', 1)])

      differ.destroy()
      vi.advanceTimersByTime(3000)

      expect(settled).not.toHaveBeenCalled()
    })
  })
})

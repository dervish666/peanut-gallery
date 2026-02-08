import type { Message } from '../shared/types'

export class MessageDiffer {
  private lastMessages: Message[] = []
  private lastTitle: string = ''
  private settlingText: string | null = null
  private settlingMessage: Message | null = null
  private settleTimer: NodeJS.Timeout | null = null
  private settledCallback: ((msg: Message) => void) | null = null

  private static SETTLE_DELAY_MS = 2000
  private static INITIAL_CONTEXT_COUNT = 3

  /**
   * Compare a new snapshot to the previous one.
   * Returns immediately-ready new messages (user messages).
   * Assistant messages that may still be streaming are debounced via onMessageSettled.
   */
  diff(title: string, messages: Message[]): Message[] {
    const ready: Message[] = []

    // Conversation switch: detected by title change only.
    // Message count drops are not reliable — transient AX tree glitches
    // can return fewer elements without an actual conversation change.
    if (title !== this.lastTitle) {
      this.resetSettling()
      this.lastTitle = title
      this.lastMessages = [...messages]

      // Return last few messages as initial context
      const contextSlice = messages.slice(
        Math.max(0, messages.length - MessageDiffer.INITIAL_CONTEXT_COUNT),
      )
      return contextSlice
    }

    this.lastTitle = title

    // No new messages
    if (messages.length <= this.lastMessages.length) {
      // Check if the last assistant message is still changing (streaming)
      if (messages.length > 0) {
        const last = messages[messages.length - 1]
        if (last.role === 'assistant') {
          this.handlePossibleStreaming(last)
        }
      }
      this.lastMessages = [...messages]
      return ready
    }

    // New messages appeared
    const newMessages = messages.slice(this.lastMessages.length)
    this.lastMessages = [...messages]

    for (const msg of newMessages) {
      if (msg.role === 'user') {
        // User messages don't stream — emit immediately
        ready.push(msg)
      } else {
        // Assistant messages may still be streaming — debounce
        this.startSettling(msg)
      }
    }

    return ready
  }

  private handlePossibleStreaming(msg: Message): void {
    if (this.settlingText !== null && msg.text !== this.settlingText) {
      // Text is still changing — restart the settle timer
      this.startSettling(msg)
    }
  }

  private startSettling(msg: Message): void {
    this.resetSettling()
    this.settlingText = msg.text
    this.settlingMessage = msg

    // Don't start the settle timer for thinking messages — the actual response
    // hasn't arrived yet. Keep settlingText so handlePossibleStreaming will
    // detect when the text changes to the real response and restart settling.
    if (/^Thinking\b/i.test(msg.text)) {
      return
    }

    this.settleTimer = setTimeout(() => {
      const settled = this.settlingMessage
      this.settlingText = null
      this.settlingMessage = null
      this.settleTimer = null
      if (this.settledCallback && settled) {
        this.settledCallback(settled)
      }
    }, MessageDiffer.SETTLE_DELAY_MS)
  }

  private resetSettling(): void {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer)
      this.settleTimer = null
    }
    this.settlingText = null
    this.settlingMessage = null
  }

  onMessageSettled(callback: (msg: Message) => void): void {
    this.settledCallback = callback
  }

  destroy(): void {
    this.resetSettling()
    this.settledCallback = null
  }
}

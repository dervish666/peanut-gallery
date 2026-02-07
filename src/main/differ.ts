import type { Message } from '../shared/types'

export class MessageDiffer {
  private lastMessages: Message[] = []
  private lastTitle: string = ''
  private settlingText: string | null = null
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

    // Conversation switch: title changed or message count dropped
    if (title !== this.lastTitle || messages.length < this.lastMessages.length) {
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

    this.settleTimer = setTimeout(() => {
      this.settlingText = null
      this.settleTimer = null
      if (this.settledCallback) {
        this.settledCallback(msg)
      }
    }, MessageDiffer.SETTLE_DELAY_MS)
  }

  private resetSettling(): void {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer)
      this.settleTimer = null
    }
    this.settlingText = null
  }

  onMessageSettled(callback: (msg: Message) => void): void {
    this.settledCallback = callback
  }

  destroy(): void {
    this.resetSettling()
    this.settledCallback = null
  }
}

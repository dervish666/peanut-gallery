import Anthropic from '@anthropic-ai/sdk'
import type { Message, CharacterConfig, CommentEvent } from '../shared/types'

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_CONTEXT_MESSAGES = 8
const MAX_MESSAGE_CHARS = 500

export class CharacterEngine {
  private client: Anthropic
  private characters: CharacterConfig[]
  private lastCommentTime: number = 0
  private cooldownMs: number = 10000
  private roundCounter: number = 0

  constructor(apiKey: string, characters: CharacterConfig[]) {
    this.client = new Anthropic({ apiKey })
    this.characters = characters
  }

  setCharacters(characters: CharacterConfig[]): void {
    this.characters = characters
  }

  async generateCommentary(
    _newMessage: Message,
    recentMessages: Message[],
  ): Promise<CommentEvent[]> {
    // Enforce cooldown
    const now = Date.now()
    if (now - this.lastCommentTime < this.cooldownMs) {
      return []
    }

    this.roundCounter++
    const roundId = `round-${this.roundCounter}`
    const comments: CommentEvent[] = []
    const previousComments: { character: string; text: string }[] = []

    // Trim context
    const context = recentMessages.slice(-MAX_CONTEXT_MESSAGES).map((m) => ({
      ...m,
      text: m.text.length > MAX_MESSAGE_CHARS ? m.text.slice(0, MAX_MESSAGE_CHARS) + '...' : m.text,
    }))

    for (const character of this.characters) {
      if (character.enabled === false) continue

      // Gate check: first character uses reactionChance, subsequent use reactionToOtherChance if there are previous comments
      const chance =
        previousComments.length > 0 ? character.reactionToOtherChance : character.reactionChance
      if (Math.random() >= chance) {
        continue
      }

      try {
        const text = await this.generateComment(character, context, previousComments)
        if (text) {
          const event: CommentEvent = {
            id: `${roundId}-${character.id}`,
            characterId: character.id,
            characterName: character.name,
            color: character.color,
            text,
            roundId,
            timestamp: Date.now(),
          }
          comments.push(event)
          previousComments.push({ character: character.name, text })
        }
      } catch (err) {
        console.error(`[${character.name}] API error:`, err)
      }
    }

    if (comments.length > 0) {
      this.lastCommentTime = Date.now()
    }

    return comments
  }

  private async generateComment(
    character: CharacterConfig,
    recentMessages: Message[],
    previousComments: { character: string; text: string }[],
  ): Promise<string> {
    const conversationContext = recentMessages.map((m) => `[${m.role}]: ${m.text}`).join('\n\n')

    let userPrompt = `Here's the recent conversation you're watching:\n\n${conversationContext}`

    if (previousComments.length > 0) {
      const otherComments = previousComments.map((c) => `${c.character}: "${c.text}"`).join('\n')
      userPrompt += `\n\nYour fellow hecklers just said:\n${otherComments}\n\nReact to the conversation and/or riff off what they said.`
    } else {
      userPrompt += `\n\nGive your commentary on this conversation.`
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
}

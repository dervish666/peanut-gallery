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
  private generating: boolean = false

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
    conversationId: string,
  ): Promise<CommentEvent[]> {
    // Enforce cooldown and prevent concurrent generation
    const now = Date.now()
    if (this.generating || now - this.lastCommentTime < this.cooldownMs) {
      return []
    }

    this.generating = true
    this.roundCounter++
    const roundId = `round-${this.roundCounter}`
    const comments: CommentEvent[] = []
    const previousComments: { character: string; text: string }[] = []

    try {
      // Trim context
      const context = recentMessages.slice(-MAX_CONTEXT_MESSAGES).map((m) => ({
        ...m,
        text:
          m.text.length > MAX_MESSAGE_CHARS ? m.text.slice(0, MAX_MESSAGE_CHARS) + '...' : m.text,
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
              conversationId,
              characterId: character.id,
              characterName: character.name,
              avatar: character.avatar || '🎤',
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
    } finally {
      this.generating = false
    }
  }

  async generateIntro(
    title: string,
    recentMessages: Message[],
    conversationId: string,
  ): Promise<CommentEvent | null> {
    const enabled = this.characters.filter((c) => c.enabled !== false)
    if (enabled.length === 0) return null

    // Pick a random character for the intro
    const character = enabled[Math.floor(Math.random() * enabled.length)]

    const context = recentMessages.slice(-MAX_CONTEXT_MESSAGES).map((m) => ({
      ...m,
      text: m.text.length > MAX_MESSAGE_CHARS ? m.text.slice(0, MAX_MESSAGE_CHARS) + '...' : m.text,
    }))

    const conversationContext =
      context.length > 0
        ? context.map((m) => `[${m.role}]: ${m.text}`).join('\n\n')
        : '(no messages yet)'

    const introPrompt = `You are ${character.name}, a deeply unenthusiastic theatre usher who has been forced to announce the next show. You are tired, you are bored, and you already know this is going to be terrible.

Announce this conversation to the audience in one short, resigned, darkly funny line. Reference the title or topic. You're not excited. You've seen it all before. Think depressed Eeyore meets jaded Broadway stagehand.

Rules:
- ONE sentence, 20 words max
- No emotes or asterisks
- Deadpan, resigned, unenthusiastic — like reading a death sentence at a funeral
- You can reference what they're talking about if messages are available`

    try {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 40,
        temperature: 1.0,
        system: introPrompt,
        messages: [
          {
            role: 'user',
            content: `Conversation title: "${title}"\n\nWhat's happening so far:\n${conversationContext}\n\nAnnounce this show:`,
          },
        ],
      })

      const block = response.content[0]
      if (block.type === 'text' && block.text.trim()) {
        this.roundCounter++
        const roundId = `round-${this.roundCounter}`
        return {
          id: `${roundId}-${character.id}-intro`,
          conversationId,
          characterId: character.id,
          characterName: character.name,
          avatar: character.avatar || '🎤',
          color: character.color,
          text: block.text.trim(),
          roundId,
          timestamp: Date.now(),
        }
      }
    } catch (err) {
      console.error(`[${character.name}] Intro error:`, err)
    }
    return null
  }

  async roastTitle(rawTitle: string): Promise<string | null> {
    try {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 30,
        temperature: 1.0,
        system:
          'You are a snarky theatre critic. Given a conversation title, roast or heckle it in one witty line of 8 words or fewer. No quotes. Just the roast.',
        messages: [
          {
            role: 'user',
            content: `Conversation title: "${rawTitle}"\n\nRoast it:`,
          },
        ],
      })

      const block = response.content[0]
      if (block.type === 'text') {
        return block.text.trim()
      }
    } catch (err) {
      console.error('[CharacterEngine] Title roast error:', err)
    }
    return null
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

import Anthropic from '@anthropic-ai/sdk'
import type { Message, CharacterConfig, CommentEvent, DirectorCastEntry } from '../shared/types'
import { parseDirectorPlan, buildDirectorMessages } from './director'
import type { RoundHistory } from './director'

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
  private roundHistory: RoundHistory[] = []

  constructor(apiKey: string, characters: CharacterConfig[]) {
    this.client = new Anthropic({ apiKey })
    this.characters = characters
  }

  setCharacters(characters: CharacterConfig[]): void {
    this.characters = characters
  }

  resetHistory(): void {
    this.roundHistory = []
  }

  async generateCommentary(
    _newMessage: Message,
    recentMessages: Message[],
    conversationId: string,
    onComment: (comment: CommentEvent) => void,
  ): Promise<void> {
    // Enforce cooldown and prevent concurrent generation
    const now = Date.now()
    if (this.generating || now - this.lastCommentTime < this.cooldownMs) {
      return
    }

    const enabled = this.characters.filter((c) => c.enabled !== false)
    if (enabled.length === 0) return

    this.generating = true
    this.roundCounter++
    const roundId = `round-${this.roundCounter}`
    const commentsByCharId: Record<string, string> = {}
    let emittedCount = 0

    try {
      // Trim context
      const context = recentMessages.slice(-MAX_CONTEXT_MESSAGES).map((m) => ({
        ...m,
        text:
          m.text.length > MAX_MESSAGE_CHARS ? m.text.slice(0, MAX_MESSAGE_CHARS) + '...' : m.text,
      }))

      // Build roster for the director
      const roster = enabled.map((c) => ({ id: c.id, name: c.name, summary: c.summary || c.name }))
      const enabledIds = enabled.map((c) => c.id)

      // Ask the director who speaks
      let plan
      try {
        const directorMessages = buildDirectorMessages(context, roster, this.roundHistory)
        const response = await this.client.messages.create({
          model: MODEL,
          max_tokens: 200,
          temperature: 0.8,
          system: directorMessages.systemPrompt,
          messages: [{ role: 'user', content: directorMessages.userMessage }],
        })
        const block = response.content[0]
        const raw = block.type === 'text' ? block.text : ''
        plan = parseDirectorPlan(raw, enabledIds)
      } catch {
        // Director API failed — fall back to first enabled character
        plan = {
          cast: [{ characterId: enabledIds[0], reactTo: 'conversation' as const, note: '' }],
        }
      }

      if (plan.cast.length === 0) return

      // Execute the cast plan sequentially
      for (let i = 0; i < plan.cast.length; i++) {
        const entry = plan.cast[i]
        const character = enabled.find((c) => c.id === entry.characterId)
        if (!character) continue

        if (i > 0) {
          await this.jitterDelay()
        }

        try {
          const text = await this.generateDirectedComment(
            character,
            context,
            entry,
            commentsByCharId,
          )
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
            onComment(event)
            commentsByCharId[character.id] = text
            emittedCount++
          }
        } catch (err) {
          console.error(`[${character.name}] API error:`, err)
        }
      }

      if (emittedCount > 0) {
        this.lastCommentTime = Date.now()
      }

      // Track this round in history (cap at 3)
      const roundComments = Object.entries(commentsByCharId).map(([charId, text]) => {
        const char = enabled.find((c) => c.id === charId)
        return { character: char?.name || charId, text }
      })
      this.roundHistory.push({ comments: roundComments })
      if (this.roundHistory.length > 3) {
        this.roundHistory = this.roundHistory.slice(-3)
      }
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

  private async generateDirectedComment(
    character: CharacterConfig,
    recentMessages: Message[],
    entry: DirectorCastEntry,
    commentsByCharId: Record<string, string>,
  ): Promise<string> {
    const conversationContext = recentMessages.map((m) => `[${m.role}]: ${m.text}`).join('\n\n')

    let userPrompt = `Here's the recent conversation you're watching:\n\n${conversationContext}`

    if (entry.reactTo !== 'conversation' && commentsByCharId[entry.reactTo]) {
      const targetChar = this.characters.find((c) => c.id === entry.reactTo)
      const targetName = targetChar?.name || entry.reactTo
      userPrompt += `\n\n${targetName} just said: "${commentsByCharId[entry.reactTo]}"\n\nRiff off what they said.`
    } else {
      userPrompt += `\n\nGive your commentary on this conversation.`
    }

    if (entry.note) {
      userPrompt += `\n\n[Director's note: ${entry.note}]`
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

  protected async jitterDelay(): Promise<void> {
    const ms = 1000 + Math.random() * 2000
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

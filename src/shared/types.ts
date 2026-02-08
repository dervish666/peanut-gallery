export interface Message {
  role: 'user' | 'assistant'
  text: string
  timestamp: string | null
  index: number
}

export interface Conversation {
  app: string
  pid: number
  title: string
  messages: Message[]
}

export interface AppInfo {
  name: string
  pid: number
  bundleIdentifier: string
}

export interface AXResponse {
  type: 'apps' | 'conversation' | 'error'
}

export interface AppsResponse extends AXResponse {
  type: 'apps'
  apps: AppInfo[]
}

export interface ConversationResponse extends AXResponse {
  type: 'conversation'
  app: string
  pid: number
  title: string
  messages: Message[]
}

export interface ErrorResponse extends AXResponse {
  type: 'error'
  code: string
  message: string
}

export type SwiftResponse = AppsResponse | ConversationResponse | ErrorResponse

export interface CharacterConfig {
  id: string
  name: string
  avatar: string
  color: string
  enabled: boolean
  systemPrompt: string
  temperature: number
  maxTokens: number
  reactionChance: number
  reactionToOtherChance: number
}

export interface NowShowingEvent {
  conversationId: string
  title: string
  characterNames: string[]
  roast: string | null
}

export interface CommentEvent {
  id: string
  characterId: string
  characterName: string
  avatar: string
  color: string
  text: string
  roundId: string
  timestamp: number
}

export interface AppSettings {
  activeCharacters: CharacterConfig[]
}

export interface PeanutGalleryAPI {
  onComment: (callback: (event: CommentEvent) => void) => () => void
  onNowShowing: (callback: (event: NowShowingEvent) => void) => () => void
  onStatus: (callback: (status: string) => void) => () => void
  getSettings: () => Promise<AppSettings>
  setSettings: (settings: AppSettings) => Promise<void>
  getPresetCharacters: () => Promise<CharacterConfig[]>
  minimize: () => void
}

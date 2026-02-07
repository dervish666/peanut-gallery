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

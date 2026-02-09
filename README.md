# Peanut Gallery

AI heckler commentary for your live chat conversations. Think Waldorf & Statler from the Muppets, but for Claude Desktop.

<img width="380" height="408" alt="image" src="https://github.com/user-attachments/assets/bd45f8e1-2443-4b4b-824a-9d871fc02b23" />


## What Is This?

Peanut Gallery watches your Claude Desktop conversations in real time using macOS Accessibility APIs, then generates running commentary from a cast of AI heckler characters. The commentary appears in a floating theatre-themed overlay beside your chat window — complete with curtains, a marquee banner, and speech bubbles.

## Features

- **Live conversation monitoring** — reads Claude Desktop messages via macOS Accessibility APIs
- **AI heckler characters** — Waldorf, Statler, and Dave each have distinct personalities and react to your conversations
- **Character chaining** — characters react to each other, not just the conversation
- **"Now Showing" marquee** — announces each new conversation with a roasted title
- **Theatre-themed overlay** — floating panel with curtains, railing, and vibrancy effects
- **Custom characters** — create your own hecklers with custom system prompts
- **Settings panel** — toggle characters, adjust reaction frequency, manage API key

## Requirements

- **macOS** (uses Accessibility APIs — no Windows/Linux support)
- **Node.js 20+**
- **Xcode Command Line Tools** (for compiling the Swift accessibility helper)
- **Anthropic API key**

## Quick Start

```bash
# Clone the repo
git clone https://github.com/dervish666/peanut-gallery.git
cd peanut-gallery

# Install dependencies (also compiles the Swift helper)
npm install

# Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-...

# Start in dev mode
npm run dev
```

On first launch, macOS will prompt you to grant Accessibility permissions to the app. Follow the prompt to enable it in System Settings > Privacy & Security > Accessibility.

## Building for Distribution

```bash
npm run build:mac
```

This produces a DMG in the `dist/` directory.

## How It Works

```
Claude Desktop ──AX API──> Swift Helper ──JSON──> Message Differ ──> Character Engine ──> Overlay UI
```

1. **Swift Helper** — a compiled CLI that reads Claude Desktop's accessibility tree to extract conversation messages
2. **Message Differ** — compares successive snapshots to detect new/changed messages, with debounce for streaming responses
3. **Character Engine** — feeds new messages to AI heckler personas (Claude Haiku) which generate one-liner commentary
4. **Overlay UI** — React + Tailwind + Framer Motion floating panel with theatre theming

## Configuration

Characters and settings are managed through the in-app settings panel (gear icon). You can:

- Enable/disable individual characters
- Adjust how often characters react to messages
- Add custom characters with your own system prompts
- Set your Anthropic API key

## Development

```bash
npm run dev          # Dev mode with hot reload
npm run build        # Production build (typecheck + build)
npm run lint         # ESLint
npm run typecheck    # TypeScript checking
npm test             # Run tests
```

## License

[MIT](LICENSE)

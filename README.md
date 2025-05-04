---
title: "ChatSnip"
source: "https://github.com/shreyas/chatsnip"
author: "Shreyas"
published: false
created: 2023-01-01
description: "A browser extension that lets you export AI chat conversations as beautifully styled HTML snippets."
tags:
  - "browser-extension"
  - "ai"
  - "chat"
  - "export"
  - "html"
---

# ChatSnip

A browser extension that lets you export AI chat conversations as beautifully styled HTML snippets.

## Features

- Supports multiple AI models (ChatGPT-4o, Claude 3 Opus, Gemini 1.5 Pro, etc.)
- Custom model name support
- Simple copy-to-clipboard functionality
- Nicely styled chat bubbles with proper attribution

## Development

1. Install dependencies:
   ```
   npm install
   ```

2. Run development build with auto-reloading:
   ```
   npm run dev
   ```

3. Build for production:
   ```
   npm run build
   ```

## Installation in Chrome

1. Build the extension using `npm run build`
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the project directory
5. The extension should now appear in your toolbar

## Usage

1. Select text from an AI chat conversation
2. Click the ChatSnip extension icon
3. Choose the AI model used in the conversation
4. Click "Copy Selected Chat"
5. Paste the HTML into your document or website

## Configuration

The project uses the following TypeScript configuration:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["DOM", "ESNext"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
``` 
# ChatSnip

A browser extension that lets you export AI chat conversations as beautifully styled HTML snippets or well-formatted Markdown.

## Features

- Supports multiple AI models (ChatGPT-4o, Claude 3 Opus, Gemini 1.5 Pro, etc.)
- Export in HTML or Markdown format
- Custom model name support
- Simple copy-to-clipboard functionality
- Nicely styled chat bubbles with proper attribution
- Automatic conversation extraction from supported AI chat websites

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

1. Click the ChatSnip extension icon while on an AI chat page (ChatGPT, Claude, or Gemini)
2. Click "Extract from Page" to automatically capture the conversation
3. Alternatively, paste your conversation text in the box
4. Choose the AI model used in the conversation
5. Click "Export as HTML" or "Export as Markdown" based on your needs
6. Paste the copied format into your document or website

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
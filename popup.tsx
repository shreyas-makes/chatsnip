import { useState, useEffect } from "react"
import copy from "copy-to-clipboard"

const models = ["ChatGPT-4o", "GPT-4", "Claude 3 Opus", "Gemini 1.5 Pro", "Custom"]

interface Message {
  isUser: boolean;
  content: string;
}

export default function Popup() {
  const [model, setModel] = useState("ChatGPT-4o")
  const [customModel, setCustomModel] = useState("")
  const [manualText, setManualText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const finalModel = model === "Custom" ? customModel : model

  // Try clipboard on mount
  useEffect(() => {
    tryReadClipboard()
  }, [])

  const tryReadClipboard = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText()
      if (clipboardText) {
        setManualText(clipboardText)
      }
    } catch (err) {
      console.log("Clipboard access denied:", err)
      // Silently fail - we're already showing manual input
    }
  }

  const handleCopy = async () => {
    try {
      setError(null)
      
      if (manualText) {
        processConversation(manualText)
        return
      }
      
      setError("Please paste your conversation text in the box above.")
    } catch (error) {
      console.error("Error:", error)
      setError("An error occurred. Please try again.")
    }
  }
  
  const processConversation = (text: string, exportMd: boolean = false) => {
    try {
      if (!text) {
        setError("No text provided. Please paste your conversation text.")
        return
      }

      // First, clean up the text
      const cleanText = text.trim().replace(/\n{3,}/g, "\n\n") // Normalize multiple newlines
      
      // Try to determine conversation structure
      let messages: Message[] = []
      
      // Case 1: Check if the text has explicit prefixes like "User:" or "AI:"
      const hasPrefixes = /^(User|You|AI|Assistant|ChatGPT|Claude|Gemini):/im.test(cleanText)
      
      if (hasPrefixes) {
        // Split by common prefixes
        const blocks = cleanText.split(/\n\s*\n/).filter(Boolean)
        
        blocks.forEach(block => {
          const isUserBlock = /^(User|You):/i.test(block)
          const content = block.replace(/^(User|You|AI|Assistant|ChatGPT|Claude|Gemini):\s*/i, "").trim()
          
          messages.push({
            isUser: isUserBlock,
            content
          })
        })
      } else {
        // Case 2: Check for transition markers like "ChatGPT said:"
        const transitionMarkerRegex = /(ChatGPT|AI|Claude|Assistant|Gemini)\s+said\s*:/i
        if (transitionMarkerRegex.test(cleanText)) {
          // Split by the transition marker
          const parts = cleanText.split(transitionMarkerRegex)
          
          if (parts.length >= 2) {
            // First part is likely user input
            if (parts[0].trim()) {
              messages.push({
                isUser: true,
                content: parts[0].trim()
              })
            }
            
            // The rest is likely AI output (skipping the matched marker)
            const aiContent = parts.slice(2).join('').trim()
            if (aiContent) {
              messages.push({
                isUser: false,
                content: aiContent
              })
            }
          }
        }
        // Case 3: Try to split by conversation patterns
        else if (cleanText.includes("?") || /\b(I want|I need|please|could you|can you)\b/i.test(cleanText)) {
          // Look for question-answer patterns
          // First split the text into potential segments at sentence boundaries
          const sentenceEndRegex = /(?<=[.!?])\s+/g
          const segments = cleanText.split(sentenceEndRegex).filter(Boolean)
          
          let currentUserSegment = ""
          let currentAISegment = ""
          let isCollectingUser = true
          
          for (let i = 0; i < segments.length; i++) {
            const segment = segments[i].trim()
            
            // Check if this looks like user text (questions, commands, etc.)
            const isUserLike = 
              segment.endsWith("?") || 
              /\b(I want|I need|please|could you|can you)\b/i.test(segment) ||
              segment.length < 60
            
            // If we're collecting user text and this is user-like, add to user segment
            if (isCollectingUser && isUserLike) {
              currentUserSegment += (currentUserSegment ? " " : "") + segment
            }
            // If we're collecting user text and this doesn't look like user text, switch to AI
            else if (isCollectingUser && !isUserLike) {
              if (currentUserSegment) {
                messages.push({
                  isUser: true,
                  content: currentUserSegment
                })
                currentUserSegment = ""
              }
              isCollectingUser = false
              currentAISegment = segment
            }
            // If we're collecting AI text and this is user-like, switch back to user
            else if (!isCollectingUser && isUserLike) {
              if (currentAISegment) {
                messages.push({
                  isUser: false,
                  content: currentAISegment
                })
                currentAISegment = ""
              }
              isCollectingUser = true
              currentUserSegment = segment
            }
            // Continue collecting AI text
            else {
              currentAISegment += (currentAISegment ? " " : "") + segment
            }
          }
          
          // Add any remaining segments
          if (currentUserSegment) {
            messages.push({
              isUser: true,
              content: currentUserSegment
            })
          }
          if (currentAISegment) {
            messages.push({
              isUser: false,
              content: currentAISegment
            })
          }
        }
        // Case 4: Fall back to treating the whole text as one message
        else {
          // Try to determine if this is likely a user or AI message
          const isLikelyUser = 
            cleanText.endsWith("?") || 
            /\b(I want|I need|please|could you|can you)\b/i.test(cleanText) ||
            cleanText.length < 100;
            
          messages.push({
            isUser: isLikelyUser,
            content: cleanText
          })
        }
      }
      
      // If no messages were detected, treat as a single AI message
      if (messages.length === 0) {
        messages.push({
          isUser: false,
          content: cleanText
        })
      }
      
      // If exporting markdown, copy markdown transcript and exit
      if (exportMd) {
        const markdown = generateMarkdown(messages, finalModel)
        const success = copy(markdown)
        if (success) {
          alert("Markdown copied to clipboard! Paste it in your document.")
        } else {
          setError("Failed to copy to clipboard. Please try again.")
        }
        return
      }
      
      // Generate HTML
      let html = `<div class="chat-container">\n`
      
      messages.forEach(message => {
        const rowClass = message.isUser ? "chat-row user" : "chat-row"
        const bubbleClass = message.isUser ? "chat-bubble user" : "chat-bubble agent"
        const name = message.isUser ? "You" : finalModel
        
        html += `  <div class="${rowClass}">\n`
        html += `    <div class="chat-name">${name}</div>\n`
        html += `    <div class="${bubbleClass}">${message.content}</div>\n`
        html += `  </div>\n`
      })
      
      html += `</div>\n`
      
      addCssAndCopy(html)
    } catch (error) {
      console.error("Error processing text:", error)
      setError("Error processing conversation. Please try again.")
    }
  }
  
  const addCssAndCopy = (html: string) => {
    // Add CSS styles
    html += `<style>
.chat-container {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}
.chat-row {
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
  align-items: flex-start;
}
.chat-row.user {
  align-items: flex-end;
}
.chat-name {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}
.chat-bubble {
  padding: 12px 16px;
  border-radius: 18px;
  max-width: 80%;
  background-color: #f0f0f0;
}
.chat-bubble.user {
  background-color: #1e88e5;
  color: white;
}
.chat-bubble.agent {
  background-color: #f0f0f0;
  color: #333;
}
</style>`

    const success = copy(html)
    if (success) {
      alert("HTML copied to clipboard! Paste it in your document.")
    } else {
      setError("Failed to copy to clipboard. Please try again.")
    }
  }

  // Add handler to export as Markdown
  const handleCopyMarkdown = async () => {
    try {
      setError(null)
      if (!manualText) {
        setError("Please paste your conversation text in the box above.")
        return
      }
      processConversation(manualText, true)
    } catch (err) {
      console.error(err)
      setError("An error occurred. Please try again.")
    }
  }

  return (
    <div className="p-4 w-80">
      <h1 className="text-xl font-bold mb-4">ChatSnip</h1>
      
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          AI Model
        </label>
        <select
          className="w-full p-2 border rounded"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      
      {model === "Custom" && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Custom Model Name
          </label>
          <input
            type="text"
            className="w-full p-2 border rounded"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="Enter model name"
          />
        </div>
      )}
      
      {error && (
        <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
          {error}
        </div>
      )}
      
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Paste Conversation Text
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Just paste your text as is - the system will automatically detect the conversation structure
        </p>
        <textarea
          className="w-full p-2 border rounded h-32 text-sm"
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder="Paste your conversation text here..."
        />
      </div>
      
      <button
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded mb-4"
        onClick={handleCopy}
      >
        Export as HTML
      </button>
      <button
        className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded mb-4"
        onClick={handleCopyMarkdown}
      >
        Export as Markdown
      </button>
      
      <p className="mt-2 text-xs text-gray-500">
        1. Copy your chat text (Ctrl+C/Cmd+C)<br/>
        2. Paste it in the box above<br/>
        3. Click "Export as HTML" or "Export as Markdown"<br/>
        4. Paste the result in your document
      </p>
    </div>
  )
}

// Add utility to generate markdown transcripts
const generateMarkdown = (messages: Message[], modelName: string): string => {
  let md = ""
  messages.forEach((msg, idx) => {
    const name = msg.isUser ? "You" : modelName
    const content = msg.content.replace(/\n/g, "\n> ")
    md += `> **${name}**: ${content}\n`
    if (idx < messages.length - 1) md += ">\n"
  })
  return md
} 
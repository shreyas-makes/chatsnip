import { useState } from "react"
import copy from "copy-to-clipboard"

const models = ["ChatGPT-4o", "GPT-4", "Claude 3 Opus", "Gemini 1.5 Pro", "Custom"]

export default function Popup() {
  const [model, setModel] = useState("ChatGPT-4o")
  const [customModel, setCustomModel] = useState("")
  const finalModel = model === "Custom" ? customModel : model

  const handleCopy = async () => {
    const selection = window.getSelection()?.toString().trim() || ""
    if (!selection) return alert("Select chat text before exporting.")

    const lines = selection.split("\n").map(l => l.trim()).filter(Boolean)

    let html = `<div class="chat-container">\n`
    lines.forEach((line, i) => {
      const isUser = i % 2 === 1
      const rowClass = isUser ? "chat-row user" : "chat-row"
      const bubbleClass = isUser ? "chat-bubble user" : "chat-bubble agent"
      const name = isUser ? "You" : finalModel
      
      html += `  <div class="${rowClass}">\n`
      html += `    <div class="chat-name">${name}</div>\n`
      html += `    <div class="${bubbleClass}">${line}</div>\n`
      html += `  </div>\n`
    })
    html += `</div>\n`
    
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

    copy(html)
    alert("HTML copied to clipboard!")
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
      
      <button
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded"
        onClick={handleCopy}
      >
        Export Selected Text
      </button>
      
      <p className="mt-4 text-xs text-gray-500">
        Select chat text in any tab, then click Export
      </p>
    </div>
  )
}

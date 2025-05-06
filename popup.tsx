import { useState, useEffect } from "react"
import copy from "copy-to-clipboard"
import { Copy, Code, FileUp } from "lucide-react"
import TurndownService from "turndown"
import DOMPurify from "dompurify"
import Defuddle from "defuddle"
import "./globals.css"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select"
import { Textarea } from "./components/ui/textarea"
import { Input } from "./components/ui/input"
import { Button } from "./components/ui/button"
import { Label } from "./components/ui/label"

// At the top of your file, add this type declaration
declare namespace chrome {
  export namespace runtime {
    export function sendMessage(message: any, callback?: (response: any) => void): void;
    export const lastError: chrome.runtime.LastError | undefined;
    export interface LastError {
      message?: string;
    }
  }
  export namespace tabs {
    export interface Tab {
      id?: number;
      url?: string;
    }
    export function query(queryInfo: {active: boolean, currentWindow: boolean}, 
                         callback: (tabs: Tab[]) => void): void;
    export function executeScript(
      tabId: number,
      details: { code: string },
      callback?: (result: any[]) => void
    ): void;
  }
  export namespace scripting {
    export interface InjectionResult<T> {
      frameId: number;
      result: T;
    }
    export function executeScript<T>(injection: {
      target: {tabId: number};
      function: () => T;
    }): Promise<InjectionResult<T>[]>;
  }
}

// At the top of your file, add this interface declaration
declare global {
  interface Window {
    getChatContent?: () => string | null;
  }
}

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
      let cleanText = text.trim().replace(/\n{3,}/g, "\n\n") // Normalize multiple newlines
      
      // Filter out standalone "ChatGPT" or "You" lines which are UI labels, not content
      cleanText = cleanText.replace(/^(ChatGPT|You)$/gm, "").replace(/\n\s*\n\s*\n/g, "\n\n").trim();
      
      // Try to determine conversation structure
      let messages: Message[] = []
      
      // First check: Filter out very short lines that might be UI labels
      // These often appear as standalone words like "ChatGPT" or "You" on their own lines
      const lines = cleanText.split('\n');
      const filteredLines = lines.filter(line => {
        const trimmed = line.trim();
        // Keep lines unless they are UI labels (standalone "ChatGPT", "You", "ChatGPT-4o", etc.)
        return !(
          /^(ChatGPT|ChatGPT-\w+|You)$/i.test(trimmed) || 
          trimmed.length < 3
        );
      });
      cleanText = filteredLines.join('\n');
      
      // Case 1: Check for the "X said:" format which is common in copied conversations
      const saidPattern = /(You|ChatGPT|Claude|Gemini|AI|Assistant)\s+said:/i;
      if (saidPattern.test(cleanText)) {
        console.log("Detected 'X said:' pattern");
        
        // Split by the pattern, but keep the delimiter
        const parts = cleanText.split(new RegExp(`(?=${saidPattern.source})`, 'i'));
        
        for (let part of parts) {
          part = part.trim();
          if (!part) continue;
          
          // Check if this part starts with the pattern
          const match = part.match(saidPattern);
          
          if (match) {
            const role = match[1];
            const isUser = /^You$/i.test(role);
            // Remove the "X said:" prefix
            const content = part.replace(saidPattern, '').trim();
            
            if (content) {
              messages.push({
                isUser,
                content
              });
            }
          } else {
            // If no pattern match but we have content, it's likely a standalone message
            // Use length and question mark heuristics to guess if it's user or AI
            // Skip very short content that might be UI labels
            if (part.trim().length > 3 && !/^(ChatGPT|You)$/i.test(part.trim())) {
              const isLikelyUser = part.endsWith("?") || 
                                 part.length < 100 || 
                                 /\b(I want|I need|please|could you|can you)\b/i.test(part);
              
              messages.push({
                isUser: isLikelyUser,
                content: part
              });
            }
          }
        }
      }
      // Case 2: Check if the text has explicit prefixes like "User:" or "AI:"
      else if (/^(User|You|AI|Assistant|ChatGPT|Claude|Gemini):/im.test(cleanText)) {
        // Extract messages using the regex pattern
        const messageRegex = /^(User|You|AI|Assistant|ChatGPT|Claude|Gemini):\s*(.+?)(?=\n\s*(?:User|You|AI|Assistant|ChatGPT|Claude|Gemini):|$)/gims;
        let match;
        while ((match = messageRegex.exec(cleanText)) !== null) {
          const [_, role, content] = match;
          const isUser = /^(User|You)$/i.test(role);
          
          if (content.trim()) {
            messages.push({
              isUser,
              content: content.trim()
            });
          }
        }
      } 
      // Case 3: For direct UI copies, extract actual message bubbles
      else if (/^(answer|what|how|why|when|is|can|could|would|should)/i.test(cleanText)) {
        // This likely indicates copied content from ChatGPT interface with message bubbles
        
        // Split into paragraphs with reasonable spacing between them
        const paragraphs = cleanText.split(/\n\s*\n/).filter(p => 
          // Filter out UI labels and very short content
          p.trim().length > 3 && 
          !/^(ChatGPT|ChatGPT-\w+|You)$/i.test(p.trim())
        );
        
        // Start with first paragraph being from user (typically the question)
        let isUser = true;
        
        for (const paragraph of paragraphs) {
          if (paragraph.trim()) {
            messages.push({
              isUser,
              content: paragraph.trim()
            });
            
            // Alternate between user and assistant
            isUser = !isUser;
          }
        }
      }
      // Case 4: Check for paragraph blocks with clear separations
      else if (cleanText.includes("\n\n")) {
        const paragraphs = cleanText.split(/\n\s*\n/).filter(Boolean);
        
        if (paragraphs.length > 1) {
          let isUserTurn = true; // Start with user
          
          for (const paragraph of paragraphs) {
            // Check for strong indicators of user/assistant messages
            const isLikelyUser = 
              paragraph.endsWith("?") || 
              /\b(I want|I need|please|could you|can you)\b/i.test(paragraph) ||
              paragraph.length < 100;
              
            const isLikelyAssistant = 
              paragraph.length > 150 || 
              /\b(here is|here's|certainly|as requested|in summary|to summarize)\b/i.test(paragraph) ||
              /\b(first|secondly|thirdly|finally|in conclusion)\b/i.test(paragraph);
            
            // Only override the turn if we have strong indicators
            if (isLikelyUser && !isLikelyAssistant) {
              isUserTurn = true;
            } else if (isLikelyAssistant && !isLikelyUser) {
              isUserTurn = false;
            }
            
              messages.push({
              isUser: isUserTurn,
              content: paragraph.trim()
            });
            
            // Alternate turns for the next paragraph
            isUserTurn = !isUserTurn;
          }
        }
      }
      // Case 5: Fallback to the improved algorithm
      else {
        // Specialized cases for common AI chat UI patterns
        
        // Check for ChatGPT output format
        if (/You:\s+.*\n\s*ChatGPT:/i.test(cleanText)) {
          const chatSegments = cleanText.split(/\n\s*(You|ChatGPT):\s*/i).filter(Boolean);
          
          let currentRole = "";
          let currentContent = "";
          
          for (let i = 0; i < chatSegments.length; i++) {
            const segment = chatSegments[i].trim();
            
            // If this is a role identifier
            if (/^(You|ChatGPT)$/i.test(segment)) {
              // If we have accumulated content, add it to messages
              if (currentRole && currentContent) {
                messages.push({
                  isUser: /^You$/i.test(currentRole),
                  content: currentContent.trim()
                });
              }
              
              // Set the new role
              currentRole = segment;
              currentContent = "";
            } 
            // Otherwise this is content
            else if (currentRole) {
              currentContent += segment;
            }
          }
          
          // Add the last message
          if (currentRole && currentContent) {
                messages.push({
              isUser: /^You$/i.test(currentRole),
              content: currentContent.trim()
            });
          }
        }
        // Generic conversation fallback
            else {
          const paragraphBreakRegex = /\n\s*\n/g;
          const paragraphs = cleanText.split(paragraphBreakRegex).filter(Boolean);
          
          if (paragraphs.length > 1) {
            let currentMessage = "";
            let isCurrentUser = true; // Start with user assumption
            
            for (let i = 0; i < paragraphs.length; i++) {
              const paragraph = paragraphs[i].trim();
              
              // Skip empty paragraphs
              if (!paragraph) continue;
              
              // Check if this paragraph strongly indicates a user message
              const isStronglyUser = 
                paragraph.endsWith("?") || 
                /\b(I want|I need|please|could you|can you)\b/i.test(paragraph) ||
                (paragraph.length < 80 && !/\b(here's|following|however|therefore|additionally)\b/i.test(paragraph));
              
              // Check if this paragraph strongly indicates an assistant message
              const isStronglyAssistant = 
                paragraph.length > 150 || 
                /\b(here's|I'd be happy to|certainly|absolutely|to answer your question)\b/i.test(paragraph) ||
                /\b(first|second|third|step 1|step 2|in summary|to summarize)\b/i.test(paragraph);
              
              // If strong indicators match current role, add to current message
              if ((isStronglyUser && isCurrentUser) || (isStronglyAssistant && !isCurrentUser)) {
                currentMessage += (currentMessage ? "\n\n" : "") + paragraph;
              }
              // If we have strong indicators of a role switch
              else if ((isStronglyUser && !isCurrentUser) || (isStronglyAssistant && isCurrentUser)) {
                // Save the current message if not empty
                if (currentMessage) {
                  messages.push({
                    isUser: isCurrentUser,
                    content: currentMessage
                  });
                  currentMessage = "";
                }
                
                // Switch roles and start a new message
                isCurrentUser = !isCurrentUser;
                currentMessage = paragraph;
              }
              // If no strong indicators, alternate roles based on length and position
              else {
                // If this is the first paragraph and no strong indicators, keep as user
                if (i === 0 && currentMessage === "") {
                  currentMessage = paragraph;
                }
                // Otherwise, add to current message if it exists, or start a new one with alternating role
                else {
                  // If we have a current message, add this as a continuation
                  if (currentMessage) {
                    currentMessage += "\n\n" + paragraph;
                  } 
                  // Otherwise start a new message with alternated role
        else {
                    isCurrentUser = !isCurrentUser;
                    currentMessage = paragraph;
                  }
                }
              }
            }
            
            // Add the last message if not empty
            if (currentMessage) {
              messages.push({
                isUser: isCurrentUser,
                content: currentMessage
              });
            }
          } else {
            // Single paragraph case - try to determine if user or assistant
          const isLikelyUser = 
            cleanText.endsWith("?") || 
            /\b(I want|I need|please|could you|can you)\b/i.test(cleanText) ||
            cleanText.length < 100;
            
          messages.push({
            isUser: isLikelyUser,
            content: cleanText
            });
          }
        }
      }
      
      // If no messages were detected, treat as a single AI message
      if (messages.length === 0) {
        messages.push({
          isUser: false,
          content: cleanText
        });
      }
      
      // If exporting markdown, copy markdown transcript and exit
      if (exportMd) {
        const markdown = generateMarkdown(messages, finalModel);
        const success = copy(markdown);
        if (success) {
          alert("Markdown copied to clipboard! Paste it in your document.");
        } else {
          setError("Failed to copy to clipboard. Please try again.");
        }
        return;
      }
      
      // Generate HTML
      let html = `<div class="chat-container">\n`;
      
      messages.forEach(message => {
        const rowClass = message.isUser ? "chat-row user" : "chat-row";
        const bubbleClass = message.isUser ? "chat-bubble user" : "chat-bubble agent";
        const name = message.isUser ? "You" : finalModel;
        
        html += `  <div class="${rowClass}">\n`;
        html += `    <div class="chat-name">${name}</div>\n`;
        html += `    <div class="${bubbleClass}">${message.content}</div>\n`;
        html += `  </div>\n`;
      });
      
      html += `</div>\n`;
      
      addCssAndCopy(html);
    } catch (error) {
      console.error("Error processing text:", error);
      setError("Error processing conversation. Please try again.");
    }
  };
  
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

  // Replace the previous extractChatFromPage function with this improved version
  const extractChatFromPage = async (): Promise<string | null> => {
    return new Promise((resolve, reject) => {
      try {
        console.log("Attempting to extract chat content...");
        
        // First check if we're on a supported site
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (!tabs || tabs.length === 0) {
            reject("No active tab found");
            return;
          }
          
          const currentUrl = tabs[0].url || "";
          console.log("Current URL:", currentUrl);
          
          // More permissive check for OpenAI URLs
          const isOpenAI = currentUrl.includes('openai.com') || 
                           currentUrl.includes('chatgpt.com') || 
                           /chat\.(openai|chatgpt)\.com/.test(currentUrl);
                           
          const isClaude = currentUrl.includes('claude.ai') || 
                          currentUrl.includes('anthropic.com');
                          
          const isGemini = currentUrl.includes('gemini.google.com') || 
                          currentUrl.includes('bard.google.com');
          
          console.log("Is OpenAI:", isOpenAI);
          console.log("Is Claude:", isClaude);
          console.log("Is Gemini:", isGemini);
          
          if (!isOpenAI && !isClaude && !isGemini) {
            reject("This page is not supported. Please navigate to ChatGPT, Claude, or Gemini.");
            return;
          }
          
          console.log("Sending message to background script");
          chrome.runtime.sendMessage(
            { action: "extractContent" },
            (response) => {
              if (chrome.runtime.lastError) {
                console.error("Runtime error:", chrome.runtime.lastError);
                reject(chrome.runtime.lastError.message);
              } else if (response && response.success) {
                console.log("Content extracted successfully");
                resolve(response.content);
              } else {
                console.error("Error in response:", response?.error || "Unknown error");
                reject(response?.error || "Unable to extract chat content");
              }
            }
          );
        });
      } catch (error) {
        console.error("Exception in extractChatFromPage:", error);
        reject(error);
      }
    });
  };

  // Replace the directExtractFromPage function with this improved version
  const directExtractFromPage = async (): Promise<string | null> => {
    try {
      return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (!tabs || !tabs[0] || !tabs[0].id) {
            reject("No active tab found");
            return;
          }
          
          const tabId = tabs[0].id;
          
          // Use the scripting API if available
          if (chrome.scripting && typeof chrome.scripting.executeScript === 'function') {
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              function: () => {
                console.log("Executing DOM-based extraction...");
                
                try {
                  // Detect which platform we're on
                  const url = window.location.href;
                  const isOpenAI = url.includes('openai.com') || url.includes('chatgpt.com');
                  const isClaude = url.includes('claude.ai') || url.includes('anthropic.com');
                  const isGemini = url.includes('gemini.google.com') || url.includes('bard.google.com');
                  
                  // Collection for our conversation
                  let conversation = '';
                  
                  // Select DOM elements based on the platform
                  if (isOpenAI) {
                    // ChatGPT: Find all conversation elements
                    // First, try specific ChatGPT selectors by role
                    const userMessages = document.querySelectorAll('[data-message-author-role="user"]');
                    const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
                    
                    if (userMessages.length > 0 || assistantMessages.length > 0) {
                      // Sort by DOM order
                      const allMessages = [];
                      userMessages.forEach(el => allMessages.push({ el, isUser: true }));
                      assistantMessages.forEach(el => allMessages.push({ el, isUser: false }));
                      
                      // Sort by position in the document
                      allMessages.sort((a, b) => {
                        return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
                      });
                      
                      // Process messages
                      for (const msg of allMessages) {
                        const contentEl = msg.el.querySelector('.markdown');
                        const content = contentEl ? contentEl.textContent || '' : msg.el.textContent || '';
                        if (content.trim()) {
                          conversation += `${msg.isUser ? 'You' : 'ChatGPT'}:\n${content.trim()}\n\n`;
                        }
                      }
                    } else {
                      // Fallback to general message structure
                      const chatItems = document.querySelectorAll('[data-testid="conversation-turn"], .group');
                      
                      chatItems.forEach((item, index) => {
                        // Try multiple methods to determine if user or assistant
                        let isUser = false;
                        
                        // Method 1: Check data attributes
                        if (item.getAttribute('data-testid') === 'conversation-turn-user') {
                          isUser = true;
                        }
                        
                        // Method 2: Check CSS classes
                        if (item.classList.contains('dark:bg-gray-800') || 
                            item.classList.contains('bg-gray-50')) {
                          isUser = true;
                        }
                        
                        // Method 3: Check for user icon
                        if (item.querySelector('[data-testid="user-message-icon"]')) {
                          isUser = true;
                        }
                        
                        // Get the content
                        let contentEl = item.querySelector('.markdown, .text-message');
                        if (!contentEl) contentEl = item;
                        const content = contentEl.textContent || '';
                        
                        if (content.trim()) {
                          conversation += `${isUser ? 'You' : 'ChatGPT'}:\n${content.trim()}\n\n`;
                        }
                      });
                    }
                  } else if (isClaude) {
                    // Claude: Find all conversation elements
                    const humanMessages = document.querySelectorAll('.human-message');
                    const aiMessages = document.querySelectorAll('.claude-message, .assistant-message');
                    
                    if (humanMessages.length > 0 || aiMessages.length > 0) {
                      const allMessages = [];
                      humanMessages.forEach(el => allMessages.push({ el, isUser: true }));
                      aiMessages.forEach(el => allMessages.push({ el, isUser: false }));
                      
                      // Sort by position
                      allMessages.sort((a, b) => {
                        return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
                      });
                      
                      // Process messages
                      for (const msg of allMessages) {
                        const content = msg.el.textContent || '';
                        if (content.trim()) {
                          conversation += `${msg.isUser ? 'You' : 'Claude'}:\n${content.trim()}\n\n`;
                        }
                      }
                    } else {
                      // Fallback for Claude
                      const chatItems = document.querySelectorAll('.message, .message-container');
                      let lastIsUser = null;
                      
                      chatItems.forEach((item) => {
                        // Try to determine if user message
                        let isUser = item.classList.contains('human') || 
                                     item.classList.contains('user') ||
                                     !!item.querySelector('.human-message');
                                     
                        // If can't determine, alternate
                        if (lastIsUser === null) {
                          // First message is usually user
                          isUser = true;
                        } else if (lastIsUser !== null && !isUser) {
                          // If we can't tell, assume it alternates
                          isUser = !lastIsUser;
                        }
                        
                        lastIsUser = isUser;
                        const content = item.textContent || '';
                        
                        if (content.trim()) {
                          conversation += `${isUser ? 'You' : 'Claude'}:\n${content.trim()}\n\n`;
                        }
                      });
                    }
                  } else if (isGemini) {
                    // Gemini: Find conversation elements
                    const userMessages = document.querySelectorAll('.user-query, .query-content');
                    const aiMessages = document.querySelectorAll('.gemini-response, .response-content');
                    
                    if (userMessages.length > 0 || aiMessages.length > 0) {
                      const allMessages = [];
                      userMessages.forEach(el => allMessages.push({ el, isUser: true }));
                      aiMessages.forEach(el => allMessages.push({ el, isUser: false }));
                      
                      // Sort by position
                      allMessages.sort((a, b) => {
                        return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
                      });
                      
                      // Process messages
                      for (const msg of allMessages) {
                        const content = msg.el.textContent || '';
                        if (content.trim()) {
                          conversation += `${msg.isUser ? 'You' : 'Gemini'}:\n${content.trim()}\n\n`;
                        }
                      }
                    } else {
                      // Fallback for Gemini
                      const chatItems = document.querySelectorAll('.chat-item, .thread-message');
                      let lastIsUser = null;
                      
                      chatItems.forEach((item) => {
                        // Try to determine if user message
                        const isUser = item.classList.contains('user') || 
                                      item.classList.contains('user-message');
                                      
                        const content = item.textContent || '';
                        
                        if (content.trim()) {
                          conversation += `${isUser ? 'You' : 'Gemini'}:\n${content.trim()}\n\n`;
                        }
                        
                        lastIsUser = isUser;
                      });
                    }
                  }
                  
                  // If we found anything, return it
                  if (conversation.trim()) {
                    return conversation.trim();
                  }
                  
                  // Last resort: Just get all text from main content
                  const mainContent = document.querySelector('main') || document.body;
                  return mainContent.textContent || null;
                } catch (err) {
                  console.error("DOM extraction error:", err);
                  return null;
                }
              }
            }).then(results => {
              if (results && results[0] && results[0].result) {
                resolve(results[0].result);
              } else {
                reject("Could not extract content from DOM");
              }
            }).catch(error => {
              console.error("Error executing DOM extraction:", error);
              reject(error.toString());
            });
          } else {
            reject("DOM extraction not available in this browser");
          }
        });
      });
    } catch (error) {
      console.error("Error in directExtractFromPage:", error);
      return null;
    }
  };

  // Update handleExtractFromPage function to use fallback if needed
  const handleExtractFromPage = async () => {
    try {
      setError(null);
      console.log("Starting extraction from current page...");
      
      try {
        // Try the normal extraction through content script first
        const chatContent = await extractChatFromPage();
        
        if (chatContent) {
          console.log("Successfully extracted content, setting in text area");
          setManualText(chatContent);
          return;
        }
      } catch (error) {
        console.log("Content script extraction failed, trying direct extraction:", error);
      }
      
      // If content script extraction fails, try direct extraction
      try {
        console.log("Attempting direct extraction fallback...");
        const directContent = await directExtractFromPage();
        
        if (directContent) {
          console.log("Successfully extracted content directly");
          setManualText(directContent);
          return;
        }
      } catch (fallbackError) {
        console.error("Direct extraction also failed:", fallbackError);
      }
      
      // If we get here, both methods failed
      console.log("No content was extracted by any method");
      setError("Please manually copy your conversation from ChatGPT");
      
    } catch (error) {
      console.error('Error in handleExtractFromPage:', error);
      setError(`Error extracting chat content: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="min-h-screen bg-background p-2 w-[450px]">
      <Card className="border-none shadow-none">
        <CardHeader className="pb-2 px-3">
          <CardTitle className="text-xl font-bold">ChatSnip</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Convert AI chat conversations to HTML or Markdown
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-3">
          <div className="space-y-1.5">
            <Label htmlFor="model-select">AI Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="model-select" className="w-full">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {model === "Custom" && (
            <div className="space-y-1.5">
              <Label htmlFor="custom-model">Custom Model Name</Label>
              <Input
                id="custom-model"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="Enter model name"
                className="w-full"
              />
            </div>
          )}
          
          {error && (
            <div className="p-2.5 bg-destructive/10 text-destructive text-sm rounded-md">
              {error.includes("Please manually copy") ? (
                <div>
                  <p className="font-medium mb-1.5">Automatic extraction failed with this ChatGPT version.</p>
                  <ol className="list-decimal pl-4 space-y-0.5 text-xs">
                    <li>Select all text in the chat (Ctrl+A or Cmd+A)</li>
                    <li>Copy it (Ctrl+C or Cmd+C)</li>
                    <li>Click 'Paste from Clipboard' button below</li>
                  </ol>
                </div>
              ) : (
                error
              )}
            </div>
          )}
          
          <div className="space-y-1.5">
            <Label htmlFor="conversation-text">Paste Conversation Text</Label>
            <p className="text-xs text-muted-foreground">
              Just paste your text as is - the system will automatically detect the conversation structure
            </p>
            <Textarea
              id="conversation-text"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Paste your conversation text here..."
              className="h-24 w-full"
            />
          </div>
          
          <div className="flex gap-2">
            <Button 
              className="flex-1 text-xs" 
              variant="outline"
              onClick={handleExtractFromPage}
              size="sm"
            >
              <FileUp className="mr-1 h-3.5 w-3.5" />
              Extract from Page
            </Button>
            <Button 
              className="flex-1 text-xs" 
              variant="outline"
              onClick={tryReadClipboard}
              size="sm"
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              Paste from Clipboard
            </Button>
          </div>
          
          <div className="flex gap-2 pt-1">
            <Button 
              className="flex-1" 
              onClick={handleCopy}
              size="sm"
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Export as HTML
            </Button>
            <Button 
              className="flex-1" 
              variant="secondary" 
              onClick={handleCopyMarkdown}
              size="sm"
            >
              <Code className="mr-1.5 h-3.5 w-3.5" />
              Export as Markdown
            </Button>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-start border-t pt-3 px-3">
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="flex items-center">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted mr-1.5 text-xs">1</span>
              Copy your chat text (Ctrl+C/Cmd+C)
            </p>
            <p className="flex items-center">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted mr-1.5 text-xs">2</span>
              Paste it in the box above
            </p>
            <p className="flex items-center">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted mr-1.5 text-xs">3</span>
              Click "Export as HTML" or "Export as Markdown"
            </p>
            <p className="flex items-center">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted mr-1.5 text-xs">4</span>
              Paste the result in your document
            </p>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}

// Add utility to generate markdown transcripts
const generateMarkdown = (messages: Message[], modelName: string): string => {
  // First generate the HTML structure
  let html = `<div class="chat-container">`
  
  messages.forEach(message => {
    const name = message.isUser ? "You" : modelName
    html += `<div class="chat-message ${message.isUser ? 'user' : 'assistant'}">
      <div class="chat-name">${name}</div>
      <div class="chat-content">${message.content}</div>
    </div>`
  })
  
  html += `</div>`
  
  // Sanitize the HTML for security
  const cleanHtml = DOMPurify.sanitize(html)
  
  // Configure Turndown
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
  })
  
  // Add custom rules for voice mapping
  turndownService.addRule('userMessage', {
    filter: (node: Node) => {
      if (!(node instanceof HTMLElement)) return false;
      return (
        node.nodeName === 'DIV' && 
        node.classList.contains('chat-message') && 
        node.classList.contains('user')
      )
    },
    replacement: (content: string, node: Node) => {
      if (!(node instanceof HTMLElement)) return content;
      const nameNode = node.querySelector('.chat-name')
      const contentNode = node.querySelector('.chat-content')
      
      if (nameNode && contentNode) {
        const name = nameNode.textContent || 'You'
        // Format the content with proper indentation for blockquote
        const formattedContent = contentNode.textContent?.replace(/\n/g, '\n> ') || ''
        return `\n> **${name}**: ${formattedContent}\n>\n`
      }
      return content
    }
  })
  
  turndownService.addRule('assistantMessage', {
    filter: (node: Node) => {
      if (!(node instanceof HTMLElement)) return false;
      return (
        node.nodeName === 'DIV' && 
        node.classList.contains('chat-message') && 
        node.classList.contains('assistant')
      )
    },
    replacement: (content: string, node: Node) => {
      if (!(node instanceof HTMLElement)) return content;
      const nameNode = node.querySelector('.chat-name')
      const contentNode = node.querySelector('.chat-content')
      
      if (nameNode && contentNode) {
        const name = nameNode.textContent || modelName
        // Format the content with proper indentation for blockquote
        const formattedContent = contentNode.textContent?.replace(/\n/g, '\n> ') || ''
        return `\n> **${name}**: ${formattedContent}\n>\n`
      }
      return content
    }
  })
  
  // Convert HTML to Markdown
  let markdown = turndownService.turndown(cleanHtml)
  
  // Clean up any extra whitespace and ensure consistent formatting
  markdown = markdown.replace(/>\n>\n/g, '>\n')
  if (markdown.endsWith('>\n')) {
    markdown = markdown.slice(0, -1)
  }
  
  return markdown
} 
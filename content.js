/**
 * Content script for ChatSnip extension
 * Extracts chat conversations from various AI chat interfaces
 */

// Function to dynamically load the Defuddle library from CDN
function loadDefuddleLibrary() {
  return new Promise((resolve, reject) => {
    try {
      // Check if Defuddle is already loaded
      if (window.Defuddle) {
        console.log("Defuddle already loaded");
        return resolve(window.Defuddle);
      }
      
      console.log("Loading Defuddle from CDN...");
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/defuddle@latest/dist/index.js';
      script.onload = () => {
        console.log("Defuddle loaded successfully");
        resolve(window.Defuddle);
      };
      script.onerror = (error) => {
        console.error("Failed to load Defuddle:", error);
        reject(error);
      };
      document.head.appendChild(script);
    } catch (error) {
      console.error("Error in loadDefuddleLibrary:", error);
      reject(error);
    }
  });
}

// Function to extract ChatGPT conversations using Defuddle
function extractOpenAIChatWithDefuddle() {
  return new Promise(async (resolve) => {
    try {
      console.log("Attempting to extract OpenAI chat content with Defuddle...");
      
      // Load Defuddle library
      const DefuddleClass = await loadDefuddleLibrary();
      
      if (!DefuddleClass) {
        console.log("Defuddle not available, falling back to direct extraction");
        const fallbackResult = extractOpenAIChat();
        return resolve(fallbackResult);
      }
      
      // Create a new Defuddle instance
      const defuddle = new DefuddleClass(document);
      
      // Define content patterns for ChatGPT
      defuddle.addPattern({
        name: 'chatgpt',
        // Match both user and assistant messages
        selector: [
          'div.markdown.prose.dark\\:prose-invert', // Assistant messages
          'div.relative.max-w-\\[var\\(--user-chat-width,70\\%\\)\\].bg-token-message-surface.rounded-3xl' // User messages
        ],
        format: (elements) => {
          if (!elements || elements.length === 0) return null;
          
          // Sort elements by their position on the page
          const sortedElements = [...elements].sort((a, b) => {
            const aRect = a.getBoundingClientRect();
            const bRect = b.getBoundingClientRect();
            return aRect.top - bRect.top;
          });
          
          let conversation = '';
          
          // Process each element
          sortedElements.forEach(element => {
            // IMPORTANT: User messages have the bg-token-message-surface class
            // Assistant messages have the prose class
            const isUserMessage = element.classList.contains('bg-token-message-surface') || 
                                 element.closest('.human-message') !== null;
            const isAssistantMessage = element.classList.contains('prose') || 
                                     element.closest('.bot-message') !== null;
            
            // Skip elements that can't be identified as either user or assistant
            if (!isUserMessage && !isAssistantMessage) return;
            
            // Get message content
            let content = '';
            
            if (isUserMessage) {
              // For user messages, content is typically in a whitespace-pre-wrap div
              const contentDiv = element.querySelector('div.whitespace-pre-wrap');
              content = contentDiv ? contentDiv.textContent || '' : element.textContent || '';
              
              // Only include if the content is meaningful
              if (content.trim().length > 0) {
                conversation += `You:\n${content.trim()}\n\n`;
              }
            } else {
              // For assistant messages, content is in the prose div itself
              // But exclude child elements that might be response controls or metadata
              const clonedElement = element.cloneNode(true);
              // Remove any non-content elements
              Array.from(clonedElement.querySelectorAll('.response-controls, .message-metadata')).forEach(el => el.remove());
              
              content = clonedElement.textContent || '';
              // Only include if the content is meaningful
              if (content.trim().length > 0) {
                conversation += `ChatGPT:\n${content.trim()}\n\n`;
              }
            }
          });
          
          return conversation.trim();
        }
      });
      
      // Add a more permissive pattern as fallback
      defuddle.addPattern({
        name: 'chatgpt-permissive',
        // More general selectors for ChatGPT interface
        selector: [
          'div[class*="prose"]', // Assistant messages (more permissive)
          'div[class*="rounded-3xl"]' // Potentially any message bubbles
        ],
        format: (elements) => {
          if (!elements || elements.length === 0) return null;
          
          // Collect all unique elements
          const uniqueElements = [];
          const elementSet = new Set();
          
          elements.forEach(element => {
            // Use outerHTML as a unique identifier
            const key = element.outerHTML;
            if (!elementSet.has(key)) {
              elementSet.add(key);
              uniqueElements.push(element);
            }
          });
          
          // Sort elements by their position on the page
          const sortedElements = uniqueElements.sort((a, b) => {
            const aRect = a.getBoundingClientRect();
            const bRect = b.getBoundingClientRect();
            return aRect.top - bRect.top;
          });
          
          let conversation = '';
          
          // Process each element
          sortedElements.forEach(element => {
            // More reliable determination of message type
            // User messages are typically right-aligned, have the token-message-surface class, or have whitespace-pre-wrap
            const hasUserIndicators = element.classList.contains('bg-token-message-surface') || 
                                    element.style.marginLeft === 'auto' ||
                                    element.classList.contains('ml-auto') ||
                                    element.querySelector('div.whitespace-pre-wrap') !== null;
                                    
            // Assistant messages typically have prose class or specific styling
            const hasAssistantIndicators = element.classList.contains('prose') || 
                                         element.classList.contains('dark:prose-invert');
            
            // Determine most likely role based on indicators
            const isUserMessage = hasUserIndicators && !hasAssistantIndicators;
            const isAssistantMessage = hasAssistantIndicators && !hasUserIndicators;
            
            // If we can't clearly determine, look for other clues
            let role = null;
            if (isUserMessage) {
              role = 'user';
            } else if (isAssistantMessage) {
              role = 'assistant';
            } else {
              // Skip elements we can't confidently categorize
              return;
            }
            
            // Get message content
            let content = '';
            if (role === 'user') {
              const whitespaceContent = element.querySelector('div.whitespace-pre-wrap');
              content = whitespaceContent ? whitespaceContent.textContent || '' : element.textContent || '';
            } else {
              content = element.textContent || '';
            }
            
            // Skip empty or very short messages that might be UI elements
            if (content.trim().length < 3) return;
            
            if (role === 'user') {
              conversation += `You:\n${content.trim()}\n\n`;
            } else {
              conversation += `ChatGPT:\n${content.trim()}\n\n`;
            }
          });
          
          return conversation.trim();
        }
      });
      
      // Add patterns for older ChatGPT interfaces
      defuddle.addPattern({
        name: 'chatgpt-legacy',
        selector: [
          '[data-message-author-role]', 
          '.message'
        ],
        format: (elements) => {
          if (!elements || elements.length === 0) return null;
          
          let conversation = '';
          
          // Process each message
          elements.forEach(item => {
            // Try different attribute patterns for user/assistant messages
            const role = item.getAttribute('data-message-author-role') || 
                      (item.classList.contains('user') ? 'user' : 
                      item.classList.contains('assistant') ? 'assistant' : null);
            
            // Try different content selectors
            const contentSelectors = [
              '[data-message-text-content="true"]',
              '.text-message-content',
              '.markdown',
              '.message-content'
            ];
            
            let content = '';
            
            // Try each selector until we find content
            for (const selector of contentSelectors) {
              const element = item.querySelector(selector);
              if (element) {
                content = element.textContent || '';
                break;
              }
            }
            
            // If no content found with selectors, use the item's own text
            if (!content) {
              content = item.textContent || '';
            }
            
            if (role === 'user' || item.classList.contains('user')) {
              conversation += `You:\n${content}\n\n`;
            } else if (role === 'assistant' || item.classList.contains('assistant')) {
              conversation += `ChatGPT:\n${content}\n\n`;
            }
          });
          
          return conversation.trim();
        }
      });
      
      // Try to extract content using our patterns
      const extractedContent = defuddle.extract();
      console.log("Defuddle extraction result:", extractedContent);
      
      // If we found content, return it
      if (extractedContent.chatgpt) {
        return resolve(extractedContent.chatgpt);
      }
      
      if (extractedContent['chatgpt-permissive']) {
        return resolve(extractedContent['chatgpt-permissive']);
      }
      
      if (extractedContent['chatgpt-legacy']) {
        return resolve(extractedContent['chatgpt-legacy']);
      }
      
      // If Defuddle patterns didn't find anything, fall back to our regular extraction
      console.log("Defuddle patterns didn't match, falling back to standard extraction...");
      const fallbackResult = extractOpenAIChat();
      resolve(fallbackResult);
      
    } catch (error) {
      console.error('Error extracting with Defuddle:', error);
      // Fall back to regular extraction method
      const fallbackResult = extractOpenAIChat();
      resolve(fallbackResult);
    }
  });
}

// Function to extract Claude conversations
function extractClaudeChat() {
  try {
    console.log("Attempting to extract Claude chat content with Defuddle...");
    
    // Define content patterns for Claude
    defuddle.addPattern({
      name: 'claude',
      selector: ['.message', '.conversationTurn'],
      format: (elements) => {
        if (!elements || elements.length === 0) return null;
        
        let conversation = '';
        
        elements.forEach(message => {
          const isHuman = message.classList.contains('human') || 
                       message.querySelector('.isHuman') !== null;
          const content = message.querySelector('.message-content, .turnContent')?.textContent || '';
          
          if (isHuman) {
            conversation += `You:\n${content}\n\n`;
          } else {
            conversation += `Claude:\n${content}\n\n`;
          }
        });
        
        return conversation.trim();
      }
    });
    
    // Try to extract content
    const extractedContent = defuddle.extract();
    
    // If we found content, return it
    if (extractedContent.claude) {
      return extractedContent.claude;
    }
    
    // Fall back to original method if Defuddle didn't work
    console.log("Defuddle patterns didn't match, falling back to original method...");
    const messages = document.querySelectorAll('.message, .conversationTurn');
    if (!messages || messages.length === 0) return null;
    
    let conversation = '';
    
    messages.forEach(message => {
      const isHuman = message.classList.contains('human') || 
                    message.querySelector('.isHuman') !== null;
      const content = message.querySelector('.message-content, .turnContent')?.textContent || '';
      
      if (isHuman) {
        conversation += `You:\n${content}\n\n`;
      } else {
        conversation += `Claude:\n${content}\n\n`;
      }
    });
    
    return conversation.trim();
  } catch (error) {
    console.error('Error extracting Claude chat:', error);
    return null;
  }
}

// Function to extract Gemini/Bard conversations
function extractGeminiChat() {
  try {
    console.log("Attempting to extract Gemini chat content with Defuddle...");
    
    // Define content patterns for Gemini
    defuddle.addPattern({
      name: 'gemini',
      selector: ['[data-message-id]', '.chat-turn'],
      format: (elements) => {
        if (!elements || elements.length === 0) return null;
        
        let conversation = '';
        
        elements.forEach(message => {
          const userLabel = message.querySelector('.user-query-text, .human-message');
          const modelResponse = message.querySelector('.response-content, .model-response');
          
          if (userLabel) {
            conversation += `You:\n${userLabel.textContent || ''}\n\n`;
          } else if (modelResponse) {
            conversation += `Gemini:\n${modelResponse.textContent || ''}\n\n`;
          }
        });
        
        return conversation.trim();
      }
    });
    
    // Try to extract content
    const extractedContent = defuddle.extract();
    
    // If we found content, return it
    if (extractedContent.gemini) {
      return extractedContent.gemini;
    }
    
    // Fall back to original method if Defuddle didn't work
    console.log("Defuddle patterns didn't match, falling back to original method...");
    const messages = document.querySelectorAll('[data-message-id], .chat-turn');
    if (!messages || messages.length === 0) return null;
    
    let conversation = '';
    
    messages.forEach(message => {
      const userLabel = message.querySelector('.user-query-text, .human-message');
      const modelResponse = message.querySelector('.response-content, .model-response');
      
      if (userLabel) {
        conversation += `You:\n${userLabel.textContent || ''}\n\n`;
      } else if (modelResponse) {
        conversation += `Gemini:\n${modelResponse.textContent || ''}\n\n`;
      }
    });
    
    return conversation.trim();
  } catch (error) {
    console.error('Error extracting Gemini chat:', error);
    return null;
  }
}

// Main function to extract chat based on the current URL
function extractChat() {
  const url = window.location.href;
  
  if (url.includes('chat.openai.com') || url.includes('chatgpt.com')) {
    return extractOpenAIChatWithDefuddle();
  } else if (url.includes('claude.ai') || url.includes('anthropic.com')) {
    return extractClaudeChat();
  } else if (url.includes('bard.google.com') || url.includes('gemini.google.com')) {
    return extractGeminiChat();
  }
  
  return null;
}

// Make the function accessible globally
window.getChatContent = extractChat;

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content script received message:", request);
  
  if (request.action === "extractContent") {
    try {
      console.log("Attempting to extract content...");
      const content = extractChat();
      console.log("Extracted content:", content ? "Found content" : "No content found");
      sendResponse({ success: true, content: content });
    } catch (error) {
      console.error("Error in content script:", error);
      sendResponse({ success: false, error: error.toString() });
    }
    return true; // Keep the message channel open for the async response
  }
});

// Also run this once when the content script loads
// This makes the function available for immediate use
(() => {
  console.log('ChatSnip content script loaded');
})();

function extractOpenAIChat() {
  try {
    console.log("Attempting to extract OpenAI chat content with standard selectors...");
    
    // Try exact selectors based on the provided example
    const exactAssistantMessages = document.querySelectorAll('div.markdown.prose.dark\\:prose-invert');
    const exactUserMessages = document.querySelectorAll('div.relative.max-w-\\[var\\(--user-chat-width,70\\%\\)\\].bg-token-message-surface.rounded-3xl');
    
    console.log("Found assistant messages:", exactAssistantMessages.length);
    console.log("Found user messages:", exactUserMessages.length);
    
    // If we found messages with either selector
    if ((exactAssistantMessages && exactAssistantMessages.length > 0) || 
        (exactUserMessages && exactUserMessages.length > 0)) {
      
      // Collect all message elements for sorting
      const allMessageElements = [];
      
      // Gather all message elements to sort them by position
      exactAssistantMessages.forEach(el => {
        allMessageElements.push({
          element: el,
          isUser: false
        });
      });
      
      exactUserMessages.forEach(el => {
        allMessageElements.push({
          element: el,
          isUser: true
        });
      });
      
      // Sort by vertical position to maintain conversation order
      allMessageElements.sort((a, b) => {
        const aRect = a.element.getBoundingClientRect();
        const bRect = b.element.getBoundingClientRect();
        return aRect.top - bRect.top;
      });
      
      let conversation = '';
      
      // Process each message in order
      allMessageElements.forEach(item => {
        const element = item.element;
        const isUserMessage = item.isUser;
        
        // Get message content
        let content = '';
        
        if (isUserMessage) {
          // For user messages, content is typically in a whitespace-pre-wrap div
          const contentDiv = element.querySelector('div.whitespace-pre-wrap');
          content = contentDiv ? contentDiv.textContent || '' : element.textContent || '';
          
          // Only add if content is meaningful
          if (content.trim().length > 0) {
            conversation += `You:\n${content.trim()}\n\n`;
          }
        } else {
          // For assistant messages, content is in the prose div itself
          // Clone and clean to avoid including non-content elements
          const clonedElement = element.cloneNode(true);
          Array.from(clonedElement.querySelectorAll('.response-controls, .message-metadata')).forEach(el => el.remove());
          
          content = clonedElement.textContent || '';
          
          // Only add if content is meaningful
          if (content.trim().length > 0) {
            conversation += `ChatGPT:\n${content.trim()}\n\n`;
          }
        }
      });
      
      return conversation.trim();
    }
    
    // If the exact selectors didn't work, try slightly more permissive selectors
    console.log("Exact selectors didn't match, trying more permissive selectors...");
    
    // Try more permissive selectors for newer ChatGPT interfaces
    const proseElements = document.querySelectorAll('div[class*="prose"]');
    const chatBubbles = document.querySelectorAll('div[class*="rounded-3xl"]');
    
    console.log("Found prose elements:", proseElements.length);
    console.log("Found chat bubbles:", chatBubbles.length);
    
    if ((proseElements && proseElements.length > 0) || 
        (chatBubbles && chatBubbles.length > 0)) {
        
      // Collect all potential message elements with role identification
      const potentialMessages = [];
      
      // Gather assistant messages (prose elements)
      proseElements.forEach(el => {
        potentialMessages.push({
          element: el,
          isUser: false
        });
      });
      
      // Gather user messages (chat bubbles)
      chatBubbles.forEach(el => {
        // Skip if already included in prose elements
        if (!potentialMessages.some(item => item.element === el)) {
          // Determine if this is likely a user message
          const isLikelyUser = el.classList.contains('bg-token-message-surface') || 
                              el.querySelector('div.whitespace-pre-wrap') !== null;
          
          // Only add as user message if we're confident
          if (isLikelyUser) {
            potentialMessages.push({
              element: el,
              isUser: true
            });
          }
        }
      });
      
      // Sort by vertical position
      potentialMessages.sort((a, b) => {
        const aRect = a.element.getBoundingClientRect();
        const bRect = b.element.getBoundingClientRect();
        return aRect.top - bRect.top;
      });
      
      let conversation = '';
      
      // Process each potential message
      potentialMessages.forEach(item => {
        const element = item.element;
        const isUserMessage = item.isUser;
        
        // Get the text content
        let content = '';
        
        if (isUserMessage) {
          const whitespaceContent = element.querySelector('div.whitespace-pre-wrap');
          content = whitespaceContent ? whitespaceContent.textContent || '' : element.textContent || '';
        } else {
          // For assistant messages, clone and clean
          const clonedElement = element.cloneNode(true);
          Array.from(clonedElement.querySelectorAll('.response-controls, .message-metadata')).forEach(el => el.remove());
          content = clonedElement.textContent || '';
        }
        
        // Skip empty or very short messages that might be UI elements
        if (content.trim().length < 3) return;
        
        if (isUserMessage) {
          conversation += `You:\n${content.trim()}\n\n`;
        } else {
          conversation += `ChatGPT:\n${content.trim()}\n\n`;
        }
      });
      
      if (conversation) {
        return conversation.trim();
      }
    }
    
    // Try the original methods if the specific method didn't work
    console.log("Attempting to extract OpenAI chat content with standard selectors...");
    
    // First try the new ChatGPT interface (both chat.openai.com and chatgpt.com)
    const threadItems = document.querySelectorAll('[data-message-author-role], .message');
    if (threadItems && threadItems.length > 0) {
      console.log("Found thread items: ", threadItems.length);
      let conversation = '';
      
      threadItems.forEach(item => {
        // Try different attribute patterns for user/assistant messages
        const role = item.getAttribute('data-message-author-role') || 
                    (item.classList.contains('user') ? 'user' : 
                     item.classList.contains('assistant') ? 'assistant' : null);
        
        console.log("Found message with role:", role);
        
        // Try different content selectors
        const contentSelectors = [
          '[data-message-text-content="true"]',
          '.text-message-content',
          '.markdown',
          '.message-content'
        ];
        
        let content = '';
        
        // Try each selector until we find content
        for (const selector of contentSelectors) {
          const element = item.querySelector(selector);
          if (element) {
            content = element.textContent || '';
            break;
          }
        }
        
        // If no content found with selectors, use the item's own text
        if (!content) {
          content = item.textContent || '';
        }
        
        if (role === 'user' || item.classList.contains('user')) {
          conversation += `You:\n${content}\n\n`;
        } else if (role === 'assistant' || item.classList.contains('assistant')) {
          conversation += `ChatGPT:\n${content}\n\n`;
        }
      });
      
      return conversation.trim();
    }
    
    // Try alternative selectors for older versions
    console.log("Trying alternative selectors...");
    const chatContainer = document.querySelector('.chat-container, main, .conversation, #__next');
    if (!chatContainer) {
      console.log("No chat container found");
      return null;
    }
    
    const userMessages = chatContainer.querySelectorAll('.user-message, .human-message, [data-user-message], .user');
    const aiMessages = chatContainer.querySelectorAll('.ai-message, .assistant-message, [data-assistant-message], .assistant');
    
    console.log("User messages:", userMessages.length);
    console.log("AI messages:", aiMessages.length);
    
    if ((userMessages.length > 0 || aiMessages.length > 0)) {
      let conversation = '';
      
      // Extract user messages
      userMessages.forEach(msg => {
        const content = msg.textContent || '';
        conversation += `You:\n${content}\n\n`;
      });
      
      // Extract AI messages
      aiMessages.forEach(msg => {
        const content = msg.textContent || '';
        conversation += `ChatGPT:\n${content}\n\n`;
      });
      
      return conversation.trim();
    }
    
    // Last resort: Look for any elements that might contain the conversation
    console.log("Trying generic conversation extraction...");
    const possibleContainers = document.querySelectorAll('main div[class*="conversation"], main div[class*="message"], #__next div[class*="conversation"]');
    if (possibleContainers.length > 0) {
      // Use the container with the most content as that's likely the chat
      let bestContainer = null;
      let maxLength = 0;
      
      possibleContainers.forEach(container => {
        const text = container.textContent || '';
        if (text.length > maxLength) {
          maxLength = text.length;
          bestContainer = container;
        }
      });
      
      if (bestContainer && maxLength > 100) {
        // This is our best guess at a conversation
        return bestContainer.textContent || '';
      }
    }
    
    console.log("No chat content found");
    return null;
  } catch (error) {
    console.error('Error extracting OpenAI chat:', error);
    return null;
  }
} 
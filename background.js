// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractContent") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0] || !tabs[0].id) {
        sendResponse({ success: false, error: "No active tab found" });
        return;
      }
      
      const tabId = tabs[0].id;
      
      try {
        // Forward the message to the content script in the active tab
        chrome.tabs.sendMessage(tabId, { action: "extractContent" }, (response) => {
          // If there's an error (e.g., content script not running), return an error
          if (chrome.runtime.lastError) {
            console.error("Error sending message to content script:", chrome.runtime.lastError);
            sendResponse({ 
              success: false, 
              error: chrome.runtime.lastError.message || "Could not communicate with page. Make sure you're on a supported chat page." 
            });
            return;
          }
          
          // Otherwise, forward the response from the content script
          sendResponse(response);
        });
      } catch (error) {
        console.error("Error in background script:", error);
        sendResponse({ success: false, error: error.toString() });
      }
    });
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
});

// Listen for extension installation/update
chrome.runtime.onInstalled.addListener(() => {
  console.log("ChatSnip extension installed/updated");
}); 
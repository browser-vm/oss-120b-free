/**
 * LLM Chat App Frontend
 *
 * Handles the chat UI interactions and communication with the backend API.
 */

// DOM elements
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
// const typingIndicator = document.getElementById("typing-indicator");

// Data structures for multiple chats
/**
 * Interface for a single chat
 * @typedef {Object} Chat
 * @property {string} id - Unique chat identifier
 * @property {string} title - Display title for the chat
 * @property {Array} history - Array of chat messages
 */

/**
 * All chats storage
 * @type {Array<Chat>}
 */
let chats = [];

/**
 * Current active chat ID
 * @type {string|null}
 */
let currentChatId = null;

/**
 * Current chat history (reference to active chat's history)
 * @type {Array}
 */
let currentChatHistory = [];

/**
 * Welcome message for new chats
 * @type {Object}
 */
const WELCOME_MESSAGE = {
  role: "assistant",
  content: "Hello! I'm OSS-120b, an AI model from OpenAI (similar to ChatGPT, but smaller, and open-source!) How can I help you today?"
};

// Global state
let isProcessing = false;

// Auto-resize textarea as user types
userInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = this.scrollHeight + "px";
});

// Send message on Enter (without Shift)
userInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Send button click handler
sendButton.addEventListener("click", sendMessage);

/**
 * Sends a message to the chat API and processes the response
 */
async function sendMessage() {
  const message = userInput.value.trim();

  // Don't send empty messages
  if (message === "" || isProcessing) return;

  // Disable input while processing
  isProcessing = true;
  userInput.disabled = true;
  sendButton.disabled = true;

  // Add user message to chat
  addMessageToChat("user", message);

  // Clear input
  userInput.value = "";
  userInput.style.height = "auto";

  // Add message to current chat history
  currentChatHistory.push({ role: "user", content: message });

  // Auto-save current chat
  if (currentChatId) {
    const currentChat = getCurrentChat();
    if (currentChat) {
      currentChat.history = currentChatHistory;
      saveChat(currentChat);
    }
  }

  // Create thinking indicator as assistant message
  const thinkingEl = document.createElement("div");
  thinkingEl.className = "message assistant-message";
  thinkingEl.id = "thinking-indicator";
  thinkingEl.innerHTML = '<p><em>AI is thinking...</em></p>';
  chatMessages.appendChild(thinkingEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    // Remove thinking indicator and create new assistant response element
    thinkingEl.remove();
    const assistantMessageEl = document.createElement("div");
    assistantMessageEl.className = "message assistant-message";
    assistantMessageEl.innerHTML = "<p></p>";
    chatMessages.appendChild(assistantMessageEl);

     // Scroll to bottom
     chatMessages.scrollTop = chatMessages.scrollHeight;

     // Build oss-120b API request body
     const requestBody = {
       input: currentChatHistory.map((msg) => msg.content).join("\n"),
       // Optionally add reasoning here, e.g.:
       // reasoning: { effort: "medium", summary: "auto" }
     };

    // Send request to API
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    // Handle errors
    if (!response.ok) {
      throw new Error("Failed to get response");
    }

    let responseText = "";
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("text/event-stream")) {
      // Process streaming response (SSE)
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // Each SSE event may be a line of JSON or plain text
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            // Try to parse as JSON
            const jsonData = JSON.parse(line);
            if (jsonData.response) {
              responseText += jsonData.response;
              assistantMessageEl.querySelector("p").textContent = responseText;
              chatMessages.scrollTop = chatMessages.scrollHeight;
            }
          } catch {
            // If not JSON, treat as plain text
            responseText += line;
            assistantMessageEl.querySelector("p").textContent = responseText;
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
        }
      }
    } else {
      // Non-streaming: assume JSON
      const data = await response.json();
      if (data && typeof data === "object" && Array.isArray(data.output)) {
        // Find the assistant message in output
        const assistantMsg = data.output.find(
          (item) => item.type === "message" && item.role === "assistant"
        );
        if (assistantMsg && Array.isArray(assistantMsg.content)) {
          // Find the first content with type 'output_text'
          const textObj = assistantMsg.content.find(
            (c) => c.type === "output_text" && typeof c.text === "string"
          );
          responseText = textObj ? textObj.text : "[No response text found]";
        } else {
          responseText = "[No assistant message found]";
        }
      } else {
        responseText = String(data);
      }
  // Render markdown and line breaks using marked.js
  assistantMessageEl.querySelector("p").innerHTML = window.marked.parse(responseText);
  chatMessages.scrollTop = chatMessages.scrollHeight;
    }
     // Add completed response to current chat history
     currentChatHistory.push({ role: "assistant", content: responseText });

     // Auto-save current chat
     if (currentChatId) {
       const currentChat = getCurrentChat();
       if (currentChat) {
         currentChat.history = currentChatHistory;
         saveChat(currentChat);
       }
     }
   } catch (error) {
    console.error("Error:", error);
    addMessageToChat(
      "assistant",
      "Sorry, there was an error processing your request.",
    );
  } finally {
    // Remove thinking indicator if it still exists (in case of error before removal)
    const thinkingIndicator = document.getElementById("thinking-indicator");
    if (thinkingIndicator) {
      thinkingIndicator.remove();
    }

    // Re-enable input
    isProcessing = false;
    userInput.disabled = false;
    sendButton.disabled = false;
    userInput.focus();
  }
}

/**
 * Helper function to add message to chat UI
 * Used for both appending new messages and re-rendering history when switching chats
 */
function addMessageToChat(role, content, isReRender = false) {
  const messageEl = document.createElement("div");
  messageEl.className = `message ${role}-message`;
  
  // Render markdown and line breaks for assistant, plain for user
  if (role === "assistant") {
    messageEl.innerHTML = `<p>${window.marked.parse(content)}</p>`;
  } else {
    messageEl.innerHTML = `<p>${content.replace(/\n/g, "<br>")}</p>`;
  }
  
  if (!isReRender) {
    chatMessages.appendChild(messageEl);
    // Scroll to bottom only when appending new messages
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  return messageEl; // Return element for re-rendering use
}


/**
 * LocalStorage operations for chat persistence
 */

/**
 * Save all chats to localStorage
 */
function saveChats() {
  try {
    localStorage.setItem('oss120b_chats', JSON.stringify(chats));
  } catch (error) {
    console.error('Failed to save chats to localStorage:', error);
  }
}

/**
 * Load all chats from localStorage
 * @returns {Array<Chat>} Array of chats or empty array if none found
 */
function loadAllChats() {
  try {
    const stored = localStorage.getItem('oss120b_chats');
    if (stored) {
      chats = JSON.parse(stored);
      // Validate loaded chats have required properties
      chats = chats.filter(chat => chat.id && chat.title && Array.isArray(chat.history));
      return chats;
    }
  } catch (error) {
    console.error('Failed to load chats from localStorage:', error);
  }
  return [];
}

/**
 * Save a single chat to localStorage (updates the chats array)
 * @param {Chat} chat - The chat to save
 */
function saveChat(chat) {
  const index = chats.findIndex(c => c.id === chat.id);
  if (index > -1) {
    chats[index] = chat;
  } else {
    chats.push(chat);
  }
  saveChats();
}

/**
 * Delete a chat by ID
 * @param {string} chatId - ID of chat to delete
 * @returns {boolean} True if deleted, false if not found
 */
function deleteChat(chatId) {
  const index = chats.findIndex(c => c.id === chatId);
  if (index > -1) {
    chats.splice(index, 1);
    saveChats();
    // If deleting current chat, reset current
    if (currentChatId === chatId) {
      currentChatId = null;
      currentChatHistory = [];
    }
    return true;
  }
  return false;
}

/**
 * Set the current chat by ID
 * @param {string} chatId - ID of chat to set as current
 */
function setCurrentChat(chatId) {
  const chat = chats.find(c => c.id === chatId);
  if (chat) {
    currentChatId = chatId;
    currentChatHistory = chat.history;
    return true;
  }
  return false;
}

/**
 * Get the current chat object
 * @returns {Chat|null} Current chat or null if none set
 */
function getCurrentChat() {
  return currentChatId ? chats.find(c => c.id === currentChatId) : null;
}

/**
 * Update the current chat's history reference
 */
function updateCurrentChatHistory() {
  if (currentChatId) {
    const chat = getCurrentChat();
    if (chat) {
      currentChatHistory = chat.history;
    }
  }
}

/**
 * Chat management handlers
 */

/**
 * Create a new chat
 * @returns {string} ID of the new chat
 */
function createNewChat() {
  const newChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const newChat = {
    id: newChatId,
    title: 'New Chat',
    history: [JSON.parse(JSON.stringify(WELCOME_MESSAGE))] // Deep copy welcome message
  };
  
  chats.push(newChat);
  saveChats();
  setCurrentChat(newChatId);
  renderChatHistory();
  updateChatList();
  return newChatId;
}

/**
 * Switch to a different chat
 * @param {string} chatId - ID of chat to switch to
 */
function switchChat(chatId) {
  if (setCurrentChat(chatId)) {
    // Save previous chat if it was modified
    if (currentChatId && currentChatId !== chatId) {
      const prevChat = getCurrentChat();
      if (prevChat) {
        prevChat.history = currentChatHistory;
        saveChat(prevChat);
      }
    }
    renderChatHistory();
    updateChatList();
  }
}

/**
 * Render the current chat's history to the UI
 */
function renderChatHistory() {
  // Clear existing messages
  chatMessages.innerHTML = '';
  
  // Render all messages in current history
  currentChatHistory.forEach(message => {
    const messageEl = addMessageToChat(message.role, message.content, true);
    chatMessages.appendChild(messageEl);
  });
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Update the chat list in the sidebar
 */
function updateChatList() {
  const chatList = document.getElementById('chat-list');
  if (!chatList) return;
  
  chatList.innerHTML = '';
  
  chats.forEach(chat => {
    const li = document.createElement('li');
    li.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
    li.dataset.chatId = chat.id;
    
    const preview = chat.history.length > 1 ? chat.history[1].content.substring(0, 50) + '...' : 'No messages yet';
    
    li.innerHTML = `
      <div class="chat-title">${chat.title}</div>
      <div class="chat-preview">${preview}</div>
      <button class="chat-delete" data-chat-id="${chat.id}">×</button>
    `;
    
    li.addEventListener('click', (e) => {
      if (!e.target.classList.contains('chat-delete')) {
        switchChat(chat.id);
      }
    });
    
    chatList.appendChild(li);
  });
}

/**
 * Delete chat handler
 * @param {string} chatId - ID of chat to delete
 */
function deleteChatHandler(chatId) {
  if (confirm('Are you sure you want to delete this chat? This cannot be undone.')) {
    deleteChat(chatId);
    updateChatList();
    // If no chats left, create a new one
    if (chats.length === 0) {
      createNewChat();
    } else if (!currentChatId) {
      // Set first chat as current if current was deleted
      setCurrentChat(chats[0].id);
      renderChatHistory();
    }
  }
}

// Event listeners for chat management
document.addEventListener('DOMContentLoaded', function() {
  const newChatButton = document.getElementById('new-chat-button');
  const chatList = document.getElementById('chat-list');
  
  if (newChatButton) {
    newChatButton.addEventListener('click', createNewChat);
  }
  
  if (chatList) {
    chatList.addEventListener('click', (e) => {
      if (e.target.classList.contains('chat-delete')) {
        const chatId = e.target.dataset.chatId;
        deleteChatHandler(chatId);
      }
    });
  }
});

/**
 * Initialize the chat application on page load
 */
function initializeChatApp() {
  // Load chats from localStorage
  loadAllChats();
  
  // If no chats exist, create a new one
  if (chats.length === 0) {
    createNewChat();
  } else {
    // Set the most recent chat as current (last in array)
    const lastChatId = chats[chats.length - 1].id;
    setCurrentChat(lastChatId);
    renderChatHistory();
  }
  
  // Update chat list UI
  updateChatList();
  
  // Focus input
  userInput.focus();
}

// Update DOMContentLoaded listener to call initialization
document.addEventListener('DOMContentLoaded', function() {
  initializeChatApp();
  
  const newChatButton = document.getElementById('new-chat-button');
  const chatList = document.getElementById('chat-list');
  
  if (newChatButton) {
    newChatButton.addEventListener('click', createNewChat);
  }
  
  if (chatList) {
    chatList.addEventListener('click', (e) => {
      if (e.target.classList.contains('chat-delete')) {
        const chatId = e.target.dataset.chatId;
        deleteChatHandler(chatId);
      }
    });
  }
});

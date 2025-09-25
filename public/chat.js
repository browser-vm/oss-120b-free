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

// Chat state
let chatHistory = [
  {
    role: "assistant",
    content:
      "Hello! I'm OSS-120b, an AI model from OpenAI (similar to ChatGPT, but smaller, and open-source!) How can I help you today?",
  },
];
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

  // Add message to history (for local display)
  chatHistory.push({ role: "user", content: message });

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
      input: chatHistory.map((msg) => msg.content).join("\n"),
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

    // Add completed response to chat history
    chatHistory.push({ role: "assistant", content: responseText });
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
 * Helper function to add message to chat
 */
function addMessageToChat(role, content) {
  const messageEl = document.createElement("div");
  messageEl.className = `message ${role}-message`;
  // Render markdown and line breaks for assistant, plain for user
  if (role === "assistant") {
    messageEl.innerHTML = `<p>${window.marked.parse(content)}</p>`;
  } else {
    messageEl.innerHTML = `<p>${content.replace(/\n/g, "<br>")}</p>`;
  }
  chatMessages.appendChild(messageEl);

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

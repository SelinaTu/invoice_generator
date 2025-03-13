export const chatHandlers = {
  scrollChatToBottom: function () {
    // Wait for next tick to ensure content is rendered
    setTimeout(() => {
      const chatHistory = document.getElementById('chat-history');
      if (chatHistory) {
        chatHistory.scrollTop = chatHistory.scrollHeight;
      }
    }, 50);
  },

  sendChat: async function () {
    if ((!this.chatInput.trim() && !this.fileContext) || this.isLoading) return;

    const message = this.chatInput.trim();
    this.chatInput = '';
    this.isLoading = true;

    // Add user message to chat
    this.chatHistory.push({
      role: 'user',
      content: message || 'Uploaded file for analysis',
      filename: this.fileContext?.filename,
      mounted: false
    });
    this.scrollChatToBottom();

    try {
      const response = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message || 'Please analyze this file',
          currentInvoice: this.invoice,
          fileContext: this.fileContext
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.suggestions) {
        data.changeSummary = this.summarizeChanges(data.suggestions, this.invoice);
      }

      // Add assistant response and scroll
      this.chatHistory.push({
        role: 'assistant',
        ...data
      });
      this.scrollChatToBottom();
    } catch (error) {
      console.error('Chat error:', error);
      this.chatHistory.push({
        role: 'assistant',
        content: 'Error: ' + (error.message || 'Failed to process request') + '. Please try again.'
      });
      this.scrollChatToBottom();
    } finally {
      this.isLoading = false;
      this.fileContext = null;
    }
  },

  handleChatInput: function (value) {
    this.chatInput = value;
    // Manually trigger expansion after the next tick
    setTimeout(() => {
      const textarea = document.querySelector('textarea[x-model="chatInput"]');
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
      }
    }, 0);
  },

  toggleChatHistory: function () {
    this.isChatHistoryVisible = !this.isChatHistoryVisible;
  }
};
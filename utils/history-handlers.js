export const historyHandlers = {
  // Record state changes
  recordState: function(newState) {
    if (!produce) return;

    try {
      // Remove any future states if we're not at the end
      this.history = this.history.slice(0, this.currentIndex + 1);

      // Add new state
      this.history.push(JSON.parse(JSON.stringify(newState)));
      this.currentIndex++;

      this.updateUndoRedoState();
    } catch (error) {
      console.error('Error recording state:', error);
    }
  },

  // Update state management
  updateUndoRedoState: function() {
    this.canUndo = this.currentIndex > 0;
    this.canRedo = this.currentIndex < this.history.length - 1;
  },

  undo: function() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.invoice = JSON.parse(JSON.stringify(this.history[this.currentIndex]));
      this.updateUndoRedoState();
    }
  },

  redo: function() {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      this.invoice = JSON.parse(JSON.stringify(this.history[this.currentIndex]));
      this.updateUndoRedoState();
    }
  },

  resetForm: async function() {
    if (!confirm('Are you sure you want to reset the form? All unsaved changes will be lost.')) {
      return;
    }

    await this.animateOut();
    
    const defaultInvoice = this.invoiceManager.defaultInvoice();
    this.invoice = defaultInvoice;
    this.history = [defaultInvoice];
    this.currentIndex = 0;
    this.updateUndoRedoState();

    await this.animateIn();
  },

  loadDemo: async function(outMs=200, inMs=400) {
    const demoInvoice = window.getDemoInvoice();
    this.updateInvoice({
      type: this.invoiceManager.UPDATE_TYPES.FULL,
      payload: demoInvoice
    });
    this.generateQrCode();

    await this.animateOut(outMs);
    Alpine.store('workspace').isNewPage = false;
    await new Promise(resolve => setTimeout(resolve, 200));
    await this.animateIn(inMs);
  },

  resetWorkspace: async function() {
    try {
      // Animate out first
      await this.animateOut(200);
      
      // Reset workspace state
      Alpine.store('workspace').isNewPage = true;
      
      // Reset chat-related state
      this.chatInput = '';
      this.chatHistory = [];
      this.fileContext = null;
      this.isLoading = false;
      this.isUploading = false;
      
      // Reset invoice to default state
      const defaultInvoice = this.invoiceManager.defaultInvoice();
      this.invoice = defaultInvoice;
      this.history = [defaultInvoice];
      this.currentIndex = 0;
      this.updateUndoRedoState();
      
      // Animate back in
      await this.animateIn();
    } catch (error) {
      console.error('Error resetting workspace:', error);
      this.showToast('Error resetting workspace', 'error');
      // Make sure we animate back in even if there's an error
      await this.animateIn(400);
    }
  }
}; 
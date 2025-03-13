export const invoiceUpdateHandlers = {
  updateInvoice: function(action) {
    if (this.isUpdating) return;
    this.isUpdating = true;

    // Defensive check for payload
    if (!action.payload) {
      console.error('Invalid action payload');
      this.isUpdating = false;
      return;
    }

    try {
      // Clean up empty items before updating
      if (action.type === this.invoiceManager.UPDATE_TYPES.FULL ||
        action.type === this.invoiceManager.UPDATE_TYPES.ITEMS) {
        // Ensure items exists and is an array before filtering
        const items = Array.isArray(action.payload.items) ? action.payload.items : [];
        action.payload = {
          ...action.payload,
          items: items.filter(item =>
            item && item.description &&
            (parseFloat(item.quantity) > 0 || parseFloat(item.price) > 0)
          )
        };
      }

      const produce = window.immer?.produce;
      const newInvoice = produce(this.invoice, draft => {
        const result = this.invoiceManager.handleUpdate(draft, action);
        Object.assign(draft, result);
      });

      // Record state for undo/redo
      this.history = this.history.slice(0, this.currentIndex + 1);
      this.history.push(JSON.parse(JSON.stringify(newInvoice)));
      this.currentIndex++;

      this.invoice = newInvoice;

      this.updateUndoRedoState();
    } catch (error) {
      console.error('Error updating invoice:', error);
    } finally {
      this.isUpdating = false;
    }
  },

  handleFieldUpdate: function(field, value) {
    if (field === 'paymentTerms') {
      // Handle payment terms through its dedicated update type
      this.updateInvoice({
        type: this.invoiceManager.UPDATE_TYPES.PAYMENT_TERMS,
        payload: { terms: value }
      });
    } else {
      // Handle other text field updates normally
      this.updateInvoice({
        type: this.invoiceManager.UPDATE_TYPES.TEXT,
        payload: { field, value }
      });
    }

    // Only generate QR code if payment link is updated
    if (field === 'paymentLink') {
      this.generateQrCode();
    }
  },

  handleTaxUpdate: function(value) {
    this.updateInvoice({
      type: this.invoiceManager.UPDATE_TYPES.TAX,
      payload: parseFloat(value) || 0
    });
  },

  handleItemUpdate: function(index, item) {
    this.updateInvoice({
      type: this.invoiceManager.UPDATE_TYPES.ITEM,
      payload: { index, item }
    });
  },

  addItem: function() {
    const newItem = { 
      description: '', 
      quantity: 1, 
      price: 0, 
      total: 0, 
      taxAmount: 0, 
      subtotal: 0 
    };
    
    // Update using ITEM type instead of ITEMS
    this.updateInvoice({
      type: this.invoiceManager.UPDATE_TYPES.ITEM,
      payload: {
        index: this.invoice.items.length,
        item: newItem
      }
    });
  },

  removeItem: function(index) {
    if (this.invoice.items.length <= 1) return;
    
    // Create a new array without the removed item
    const updatedItems = [...this.invoice.items];
    updatedItems.splice(index, 1);
    
    // Use FULL update type to ensure proper handling
    this.updateInvoice({
      type: this.invoiceManager.UPDATE_TYPES.FULL,
      payload: {
        ...this.invoice,
        items: updatedItems
      }
    });
  },

  handleModeToggle: function(event) {
    const newMode = event.target.checked ? 'receipt' : 'invoice';
    this.updateInvoice({
      type: this.invoiceManager.UPDATE_TYPES.MODE,
      payload: newMode
    });
  },

  handleReceiptUpdate: function(field, value) {
    this.updateInvoice({
      type: this.invoiceManager.UPDATE_TYPES.RECEIPT,
      payload: { [field]: value }
    });
  },

  toggleReceiptMode: function() {
    const newMode = this.invoice.mode === 'receipt' ? 'invoice' : 'receipt';
    this.updateInvoice({
      type: this.invoiceManager.UPDATE_TYPES.MODE,
      payload: newMode
    });
  }
}; 
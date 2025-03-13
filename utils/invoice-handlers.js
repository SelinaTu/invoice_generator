export const invoiceHandlers = {
  saveInvoice: async function() {
    try {
      const savedAt = new Date().toISOString();
      // Always stringify objects/arrays before saving
      const invoiceToSave = {
        ...this.invoice,
        savedAt,
        history: Array.isArray(this.history) ? JSON.stringify(this.history) : '[]',
        items: Array.isArray(this.invoice.items) ? JSON.stringify(this.invoice.items) : '[]',
        receipt: this.invoice.receipt ? JSON.stringify(this.invoice.receipt) : '{}',
        currentIndex: this.currentIndex
      };

      console.log('saving invoice', invoiceToSave);

      // If this is a new invoice, add it
      if (!this.invoice.id) {
        const id = await this.db.invoices.add(invoiceToSave);
        this.invoice.id = id;
      } else {
        // Otherwise update existing
        await this.db.invoices.put(invoiceToSave);
      }

      await this.loadSavedInvoices();
      this.showToast('Invoice saved successfully', 'success');
    } catch (error) {
      console.error('Error saving invoice:', error);
      this.showToast('Error saving invoice', 'error');
    }
  },

  loadInvoice: async function(savedInvoice) {
    if (!savedInvoice) return;

    try {
      // Animate out first
      await this.animateOut();
      Alpine.store('workspace').isNewPage = false;

      // Do the loading
      const invoice = {
        ...savedInvoice,
        receipt: savedInvoice.receipt || {
          paymentDate: '',
          paymentMethod: '',
          transactionId: '',
          notes: '',
          status: 'pending'
        },
        mode: savedInvoice.mode || 'invoice'
      };

      this.updateInvoice({
        type: this.invoiceManager.UPDATE_TYPES.FULL,
        payload: invoice
      });

      if (invoice.history) {
        this.history = invoice.history;
        this.currentIndex = invoice.currentIndex || 0;
        this.updateUndoRedoState();
      }

      if (invoice.paymentLink) {
        this.generateQrCode();
      }

      // Animate back in
      await this.animateIn();

    } catch (error) {
      console.error('Error loading invoice:', error);
      this.showToast('Error loading invoice', 'error');
      // Make sure we animate back in even if there's an error
      await this.animateIn();
    }
  },

  loadSavedInvoices: async function() {
    const invoices = await this.db.invoices.reverse().toArray();
    this.savedInvoices = invoices.map(inv => {
      // Safely parse JSON strings or use existing objects
      const parseJsonSafely = (str) => {
        if (!str) return {};
        if (typeof str === 'object') return str;
        try {
          return JSON.parse(str);
        } catch {
          return str;
        }
      };

      return {
        ...inv,
        customerName: inv.customerName || (inv.customer && inv.customer?.split('\n')[0]) || 'Unnamed',
        items: parseJsonSafely(inv.items),
        receipt: parseJsonSafely(inv.receipt),
        history: parseJsonSafely(inv.history)
      };
    });
  },

  deleteInvoice: async function(id) {
    if (this.isUpdating) return;
    if (confirm('Are you sure you want to delete this invoice?')) {
      try {
        this.isUpdating = true;
        await this.db.invoices.delete(id);
        await this.loadSavedInvoices();

        // Reset to default invoice if we just deleted the current one
        if (this.invoice.id === id) {
          const defaultInvoice = this.invoiceManager.defaultInvoice();
          this.updateInvoice({
            type: this.invoiceManager.UPDATE_TYPES.FULL,
            payload: defaultInvoice
          });
        }

        this.showToast('Invoice deleted successfully', 'success');
        this.isUpdating = false;
      } catch (error) {
        console.error('Error deleting invoice:', error);
        alert('Failed to delete invoice');
        this.isUpdating = false;
      }
    }
  },

  duplicateInvoice: async function(invoice) {
    const newInvoice = {
      ...JSON.parse(JSON.stringify(invoice)),
      id: 'INV-' + Date.now(),
      number: invoice.number,
      date: new Date().toISOString().split('T')[0],
      dueDate: dayjs().add(30, 'days').format('YYYY-MM-DD'),
      savedAt: new Date().toISOString(),
      mode: 'invoice',
      receipt: {
        paymentDate: '',
        paymentMethod: '',
        transactionId: '',
        notes: '',
        status: 'pending'
      }
    };

    try {
      await this.animateOut();
      
      this.invoice = newInvoice;
      await this.saveInvoice();
      await this.loadSavedInvoices();
      this.showToast('Invoice duplicated successfully', 'success');

      await this.animateIn();
    } catch (error) {
      console.error('Error duplicating invoice:', error);
      this.showToast('Error duplicating invoice', 'error');
      await this.animateIn();
    }
  }
}; 
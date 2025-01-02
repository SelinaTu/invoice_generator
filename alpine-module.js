import { getDemoInvoice, generateInvoicePreviewHtml, createInvoiceManager, formatNumber, generateId, generateReceiptDetailsHtml } from "./helpers.js";

// Import the template directly in alpine-module.js
const invoicePreviewTemplate = await Deno.readTextFile(new URL('./templates/invoice-preview.html', import.meta.url));

export { generateInvoicePreviewHtml, generateReceiptDetailsHtml }; // re-export both html generators

// Function to generate the script tag content
export const getAlpineModule = () => {
  // Convert the module function to a string and wrap it with its dependencies
  return `
    (${createAlpineModule.toString()})({
      generateId: ${generateId.toString()},
      formatNumber: ${formatNumber.toString()},
      invoicePreviewTemplate: ${JSON.stringify(invoicePreviewTemplate)},
      generateInvoicePreviewHtml: ${generateInvoicePreviewHtml.toString()},
      generateReceiptDetailsHtml: ${generateReceiptDetailsHtml.toString()},
      getDemoInvoice: ${getDemoInvoice.toString()},
      createInvoiceManager: ${createInvoiceManager.toString()}
    });
  `;
};

// Update the function signature to receive the template
export function createAlpineModule({ 
  generateId, 
  formatNumber, 
  invoicePreviewTemplate, 
  generateInvoicePreviewHtml, 
  generateReceiptDetailsHtml, 
  getDemoInvoice, 
  createInvoiceManager 
}) {
  // Make template available to window for the stringified function
  window.invoicePreviewTemplate = invoicePreviewTemplate;

  // Global utilities
  window.toast = function(message, options = {}) {
    let description = '';
    let type = 'default';
    let position = 'top-center';
    let html = '';
    if(typeof options.description != 'undefined') description = options.description;
    if(typeof options.type != 'undefined') type = options.type;
    if(typeof options.position != 'undefined') position = options.position;
    if(typeof options.html != 'undefined') html = options.html;

    window.dispatchEvent(new CustomEvent('toast-show', {
      detail: { type, message, description, position, html }
    }));
  };

  window.showToast = function(text, type = 'info', timeout = 5000) {
    window.toast(text, {
      type: type === 'error' ? 'danger' : type,
      position: 'top-center',
      timeout
    });
  };

  // Attach utilities to window
  window.generateId = generateId;
  window.formatNumber = formatNumber;
  window.generateInvoicePreviewHtml = generateInvoicePreviewHtml;
  window.generateReceiptDetailsHtml = generateReceiptDetailsHtml;
  window.getDemoInvoice = getDemoInvoice;
  window.createInvoiceManager = createInvoiceManager;
  window.html2pdf = html2pdf;

  const produce = window.immer?.produce;
  // const applyPatches = window.immer?.applyPatches;  // Get applyPatches from Immer

  // Alpine initialization
  document.addEventListener('alpine:init', () => {
    // Add new directive for auto-expanding textareas
    Alpine.directive('autoexpand', (el) => {
      // Initial setup
      const setHeight = () => {
        el.style.height = 'auto';
        el.style.height = (!el.scrollHeight || el.scrollHeight === 0) ? 'inherit' : el.scrollHeight + 'px';
      };
      
      // Set initial height
      setHeight();
      
      // Add event listeners
      el.addEventListener('input', setHeight);
      el.addEventListener('change', setHeight);
      
      // Cleanup when element is removed
      return () => {
        el.removeEventListener('input', setHeight);
        el.removeEventListener('change', setHeight);
      };
    });

    Alpine.store('workspace', {
      isNewPage: true,
      show: false,
      direction: 'in',
    });

    Alpine.data('invoiceApp', function () {
      const invoiceManager = window.createInvoiceManager();

      return {
        id: window.generateId(),
        showToast: window.showToast,
        isUpdating: false,
        show: false,
        direction: 'in',
        db: new Dexie('InvoiceManager'),
        invoice: invoiceManager.defaultInvoice(),
        savedInvoices: [],
        invoiceManager,
        history: [],
        currentIndex: -1,
        canUndo: false,
        canRedo: false,
        chatInput: '',
        chatHistory: [],
        isLoading: false,
        fileContext: null,
        isUploading: false,
        isChatHistoryVisible: true,

        init() {
          this.db.version(4).stores({
            invoices: '++id, number, date, customer, history, currentIndex, mode'
          });

          this.loadSavedInvoices();

          // Create a deep copy of the initial blank state
          const initialState = JSON.parse(JSON.stringify(this.invoice));

          // Initialize history with the blank state
          this.history = [initialState];
          this.currentIndex = 0;
          this.updateUndoRedoState();

          // Check if there are saved invoices to determine if this is first visit
          // this.db.invoices.count().then(count => {
          //   Alpine.store('workspace').isNewPage = count === 0;
          // });
        },

        // Record state changes
        recordState(newState) {
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
        updateUndoRedoState() {
          this.canUndo = this.currentIndex > 0;
          this.canRedo = this.currentIndex < this.history.length - 1;
        },

        undo() {
          if (this.currentIndex > 0) {
            this.currentIndex--;
            this.invoice = JSON.parse(JSON.stringify(this.history[this.currentIndex]));
            this.updateUndoRedoState();
          }
        },

        redo() {
          if (this.currentIndex < this.history.length - 1) {
            this.currentIndex++;
            this.invoice = JSON.parse(JSON.stringify(this.history[this.currentIndex]));
            this.updateUndoRedoState();
          }
        },

        handleItemUpdate(index, item) {
          this.updateInvoice({
            type: this.invoiceManager.UPDATE_TYPES.ITEM,
            payload: { index, item }
          });
        },

        // Single update method to handle all changes
        updateInvoice(action) {
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

        // Modified handleFieldUpdate
        handleFieldUpdate(field, value) {
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


        handleTaxUpdate(value) {
          this.updateInvoice({
            type: this.invoiceManager.UPDATE_TYPES.TAX,
            payload: parseFloat(value) || 0
          });
        },

        addItem() {
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

        removeItem(index) {
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

        // Modified resetForm
        async resetForm() {
          if (!confirm('Are you sure you want to reset the form? All unsaved changes will be lost.')) {
            return;
          }

          await this.animateOut();
          
          const defaultInvoice = this.invoiceManager.defaultInvoice();
          this.invoice = defaultInvoice;
          this.history = [defaultInvoice];
          this.currentIndex = 0;
          this.updateUndoRedoState();
          // this.showToast('Form reset', 'info');

          await this.animateIn();
        },

        // Modified loadDemo
        async loadDemo(outMs=200, inMs=400) {
          const demoInvoice = window.getDemoInvoice();
          this.updateInvoice({
            type: this.invoiceManager.UPDATE_TYPES.FULL,
            payload: demoInvoice
          });
          this.generateQrCode();

          await this.animateOut(outMs);
          Alpine.store('workspace').isNewPage = false;
          await this.animateIn(inMs);
        },


        async loadSavedInvoices() {
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
              customerName: inv.customer?.split('\n')[0] || 'Unnamed',
              items: parseJsonSafely(inv.items),
              receipt: parseJsonSafely(inv.receipt),
              history: parseJsonSafely(inv.history)
            };
          });
        },

        async saveInvoice() {
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

        // Modified loadInvoice
        async loadInvoice(savedInvoice) {
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


        async deleteInvoice(id) {
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

        async previewInvoice() {
          if (this.isUpdating) return;
          try {
            const win = window.open('', 'Invoice Preview');
            win.document.write('<!DOCTYPE html><html><head><title>Loading preview...</title></head><body></body></html>');
            win.document.close(); // Close the document first
            win.document.open(); // Reopen it to clear previous content
            win.document.write(generateInvoicePreviewHtml(this.invoice));
            win.document.close(); // Close it again to finish writing
          } catch (error) {
            console.error('Error creating invoice:', error);
            alert('Failed to create invoice');
          }
        },

        async downloadPdf() {
          if (this.isUpdating) return;
          window.showToast('Generating invoice...', 'info');
          try {
            this.isUpdating = true;
            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.top = '-9999px';
            container.style.left = '-9999px';
            // Use a standard 8.5x11 letter size in pixels (at 96dpi)
            container.style.width = '816px'; // 8.5 inches * 96dpi
            container.style.backgroundColor = 'white';
            container.style.visibility = 'hidden';
            container.innerHTML = generateInvoicePreviewHtml(this.invoice);
            document.body.appendChild(container);

            // Wait for fonts and layout
            await document.fonts.ready;

            // Convert logo to base64 if it exists
            if (this.invoice.logoUrl) {
              try {
                const logoImg = container.querySelector('.logo img');
                if (logoImg) {
                  const response = await fetch(this.invoice.logoUrl);
                  const blob = await response.blob();
                  const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                  });
                  logoImg.src = base64;
                }
              } catch (error) {
                console.warn('Failed to convert logo to base64:', error);
              }
            }

            // Convert QR code SVG to base64 if it exists
            if (this.invoice.qrCodeSvg) {
              try {
                const qrDiv = container.querySelector('.qr-code');
                if (qrDiv) {
                  const svgElement = qrDiv.querySelector('svg');
                  if (svgElement) {
                    // Set much larger dimensions for higher quality
                    const scale = 4; // Increase this for even higher quality
                    const size = 180 * scale;

                    svgElement.setAttribute('width', size.toString());
                    svgElement.setAttribute('height', size.toString());

                    // Convert SVG to a data URL
                    const svgString = new XMLSerializer().serializeToString(svgElement);
                    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
                    const url = URL.createObjectURL(svgBlob);

                    // Create a high-res canvas
                    const canvas = document.createElement('canvas');
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');

                    // Enable crisp edges
                    ctx.imageSmoothingEnabled = false;

                    // Create an image from the SVG
                    const img = new Image();
                    img.src = url;

                    // Wait for the image to load and render it to canvas
                    await new Promise((resolve) => {
                      img.onload = () => {
                        ctx.drawImage(img, 0, 0, size, size);
                        // Replace SVG with canvas-generated image
                        const pngUrl = canvas.toDataURL('image/png');
                        const newImg = document.createElement('img');
                        newImg.src = pngUrl;
                        newImg.style.width = '150px';
                        newImg.style.height = '150px';
                        qrDiv.innerHTML = '';
                        qrDiv.appendChild(newImg);
                        URL.revokeObjectURL(url);
                        resolve();
                      };
                    });
                  }
                }
              } catch (error) {
                console.warn('Failed to convert QR code to PNG:', error);
              }
            }

            // Wait for base64 conversions
            await new Promise(resolve => setTimeout(resolve, 1000));

            const element = container.querySelector('#invoice-preview');

            const opt = {
              margin: [0.3, 0.3, 0.3, 0.3],
              filename: 'invoice-' + this.invoice.number + '.pdf',
              image: { type: 'jpeg', quality: 1 },
              html2canvas: {
                scale: 2,
                useCORS: true,
                logging: true,
                width: 816, // Match container width
                windowWidth: 816,
                height: undefined,
                onclone: (clonedDoc) => {
                  const element = clonedDoc.getElementById('invoice-preview');
                  element.style.width = '816px';
                  element.style.margin = '0 auto';
                  element.style.padding = '1rem';
                  element.style.backgroundColor = 'white';
                  element.style.minHeight = '100%';
                  element.style.position = 'relative';
                  element.style.boxSizing = 'border-box';
                  element.style.fontSize = '14px'; // Base font size

                  // Make table more prominent
                  const table = element.querySelector('table');
                  if (table) {
                    table.style.width = '100%';
                    table.style.fontSize = '14px';
                  }
                }
              },
              jsPDF: {
                unit: 'in',
                format: 'letter',
                orientation: 'portrait'
              }
            };

            // Generate PDF
            await html2pdf()
              .from(element)
              .set(opt)
              .save();

            // Clean up
            document.body.removeChild(container);
            this.isUpdating = false;

            this.showToast('Invoice generated', 'info');

          } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Failed to generate PDF: ' + error.message);
            this.isUpdating = false;
          }
        },

        async createInvoice() {
          if (this.isUpdating) return;
          try {
            await this.previewInvoice();
          } catch (error) {
            console.error('Error creating invoice:', error);
            alert('Failed to create invoice');
          }
        },

        async generateQrCode() {
          if (!this.invoice.paymentLink) {
            this.invoice.qrCodeSvg = '';
            return;
          }

          try {
            const response = await fetch('/generate-qr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentLink: this.invoice.paymentLink })
            });

            const data = await response.json();
            if (data.svg) {
              this.invoice.qrCodeSvg = data.svg;
            }
          } catch (error) {
            console.error('Error generating QR code:', error);
          }
        },

        // Add the formatter to Alpine
        formatNumber(val) {
          return window.formatNumber(val);
        },

        // Update state management
        updateUndoRedoState() {
          this.canUndo = this.currentIndex > 0;
          this.canRedo = this.currentIndex < this.history.length - 1;
        },

        scrollChatToBottom() {
          // Wait for next tick to ensure content is rendered
          setTimeout(() => {
            const chatHistory = document.getElementById('chat-history');
            if (chatHistory) {
              chatHistory.scrollTop = chatHistory.scrollHeight;
            }
          }, 50);
        },

        async sendChat() {
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

        async applyInvoiceSuggestions(suggestions) {
          if (!suggestions) {
            console.error('No suggestions provided');
            return;
          }

          try {
            // First, create a clean copy of the suggestions
            const cleanSuggestions = JSON.parse(JSON.stringify(suggestions));
            const tax = parseFloat(cleanSuggestions.tax) || this.invoice.tax || 0;

            // Create base payload from suggestions first, then add invoice as fallback
            const fullPayload = {
              ...cleanSuggestions,  // Start with suggestions as the base
              tax,
              // Only use invoice values as fallbacks for required fields
              number: cleanSuggestions.number || this.invoice.number,
              date: cleanSuggestions.date || this.invoice.date,
              dueDate: cleanSuggestions.dueDate || this.invoice.dueDate,
              // Preserve any invoice fields not in suggestions
              ...Object.fromEntries(
                Object.entries(this.invoice).filter(([key]) => cleanSuggestions[key] === undefined)
              )
            };

            // Handle items separately to ensure proper calculation
            if (Array.isArray(cleanSuggestions.items) && cleanSuggestions.items.length > 0) {
              // Process new items with proper calculations
              const newItems = cleanSuggestions.items.map(item => {
                const quantity = parseFloat(item.quantity) || 0;
                const price = parseFloat(item.price) || 0;
                const total = quantity * price;
                const taxAmount = (total * tax) / 100;

                return {
                  description: item.description || '',
                  quantity,
                  price,
                  total,
                  taxAmount,
                  subtotal: total + taxAmount
                };
              });

              // Combine with existing items if they don't conflict
              const existingItems = Array.isArray(this.invoice.items)
                ? this.invoice.items.filter(item =>
                  item && item.description &&
                  (parseFloat(item.quantity) > 0 || parseFloat(item.price) > 0) &&
                  !newItems.some(newItem =>
                    newItem.description?.toLowerCase() === item.description?.toLowerCase() &&
                    parseFloat(newItem.price) === parseFloat(item.price)
                  )
                )
                : [];

              fullPayload.items = [...existingItems, ...newItems];
            }

            // console.log('Applying suggestions:', cleanSuggestions);
            // console.log('Full payload:', fullPayload);

            // Update the invoice with the new payload
            this.updateInvoice({
              type: this.invoiceManager.UPDATE_TYPES.FULL,
              payload: fullPayload
            });

            console.log('cleanSuggestions', cleanSuggestions);
            
            if (cleanSuggestions.paymentLink) {
              this.generateQrCode();
            }

            if (Alpine.store('workspace').isNewPage == true) {
              await this.animateOut();
              Alpine.store('workspace').isNewPage = false;
              await this.animateIn();
            }

            // this.toggleChatHistory(); // this is too jarring
          } catch (error) {
            console.error('Error applying suggestions:', error);
          }
        },

        summarizeChanges(suggestions, currentInvoice) {
          if (!suggestions) return '';

          const changes = [];

          // Helper function to decode HTML entities
          const decodeHtml = (html) => {
            const txt = document.createElement('textarea');
            txt.innerHTML = html;
            return txt.value;
          };

          // Helper function to stringify object values
          const stringifyValue = (value) => {
            if (value === null || value === undefined) return '_';
            if (typeof value === 'object') {
              return JSON.stringify(value);
            }
            return value.toString();
          };

          // Helper function to process changes recursively
          const processChanges = (newObj, oldObj, prefix = '') => {
            Object.entries(newObj).forEach(([key, newValue]) => {
              // Skip items array (handle separately) and null/undefined values
              if (key === 'items' || newValue == null) return;

              const oldValue = oldObj?.[key];

              // If both values are objects, process them recursively
              if (typeof newValue === 'object' && typeof oldValue === 'object') {
                processChanges(newValue, oldValue, `${prefix}${key}.`);
              } else if (newValue !== oldValue) {
                changes.push(`${prefix}${key}: ${stringifyValue(oldValue)} → ${stringifyValue(newValue)}`);
              }
            });
          };

          // Process main changes
          processChanges(suggestions, currentInvoice);

          // Check items separately
          if (Array.isArray(suggestions.items)) {
            suggestions.items.forEach(item => {
              changes.push('+ ' + item.description + ' (&#36;' + item.price + ' × ' + item.quantity + ')');
            });
          }

          // Join with literal newlines and decode HTML entities
          return changes.map(line => decodeHtml(line)).join('\n');
        },

        // Add to Alpine data properties
        chatHistory: [],
        isLoading: false,

        async handleFileSelect(event) {
          const file = event.target.files[0];
          if (!file) return;
          this.isUploading = true;
          try {
            await this.processFile(file);
          } finally {
            this.isUploading = false;
          }
        },

        async handleFileDrop(event) {
          const file = event.dataTransfer.files[0];
          if (!file) return;
          this.isUploading = true;
          try {
            await this.processFile(file);
          } finally {
            this.isUploading = false;
            this.dragActive = false;
          }
        },

        async processFile(file) {
          try {
            // If it's a PDF, try to render it to canvas first
            let canvasData = null;
            if (file.type === 'application/pdf') {
              canvasData = await this.renderPdfToCanvas(file);
            }

            const formData = new FormData();
            formData.append("file", file);

            // If we have canvas data, append it
            if (canvasData?.length > 0) {
              formData.append("pdfCanvasPages", JSON.stringify(canvasData));
            }

            const response = await fetch("/process-file", {
              method: "POST",
              body: formData
            });

            if (!response.ok) throw new Error("Upload failed");
            this.fileContext = await response.json();
          } catch (error) {
            console.error("File upload error:", error);
            alert("Error uploading file: " + error.message);
          }
        },

        async renderPdfToCanvas(file) {
          try {
            // Load PDF.js dynamically
            if (!window.pdfjsLib) {
              await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
              window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }

            const arrayBuffer = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const canvasPages = [];

            // Process each page
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
              const page = await pdf.getPage(pageNum);
              const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better quality

              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;

              await page.render({
                canvasContext: context,
                viewport: viewport
              }).promise;

              canvasPages.push(canvas.toDataURL('image/jpeg', 0.95));
            }

            return canvasPages;
          } catch (error) {
            console.error('Error rendering PDF:', error);
            return null;
          }
        },

        handleModeToggle(event) {
          const newMode = event.target.checked ? 'receipt' : 'invoice';
          this.updateInvoice({
            type: this.invoiceManager.UPDATE_TYPES.MODE,
            payload: newMode
          });
        },

        handleReceiptUpdate(field, value) {
          this.updateInvoice({
            type: this.invoiceManager.UPDATE_TYPES.RECEIPT,
            payload: { [field]: value }
          });
        },

        // Update the preview/PDF generation to handle receipt mode
        generateInvoicePreviewHtml() {
          // The existing preview generator will need to be updated to show receipt fields
          // when in receipt mode
          return this.invoice.mode === 'receipt'
            ? generateReceiptPreviewHtml(this.invoice)
            : generateInvoicePreviewHtml(this.invoice);
        },

        toggleReceiptMode() {
          const newMode = this.invoice.mode === 'receipt' ? 'invoice' : 'receipt';
          this.updateInvoice({
            type: this.invoiceManager.UPDATE_TYPES.MODE,
            payload: newMode
          });
        },

        async duplicateInvoice(invoice) {
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
        },

        toggleChatHistory() {
          this.isChatHistoryVisible = !this.isChatHistoryVisible;
        },

        async animateOut(ms=800) {
          console.log('animating out');
          Alpine.store('workspace').direction = 'out';
          Alpine.store('workspace').show = false;
          // Wait for animation to complete
          return new Promise(resolve => setTimeout(resolve, ms));
        },

        async animateIn(ms=800) {
          console.log('animating in');
          Alpine.store('workspace').direction = 'in';
          Alpine.store('workspace').show = true;
          // Wait for animation to complete

          // expand all the invoice text areas
          setTimeout(() => {
            document.querySelectorAll('textarea[x-autoexpand]').forEach(el => {
              el.style.height = '';
              el.style.height = el.scrollHeight+1 + 'px';
            });
          }, ms);
          return new Promise(resolve => setTimeout(resolve, ms));
        },

        // Add new method to start working
        async startWorking() {
          await this.animateOut(200);
          Alpine.store('workspace').isNewPage = false;
          await this.animateIn(400);
        },

        handleChatInput(value) {
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

        async resetWorkspace() {
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
        },

        async handleClipboardPaste(event) {
          // Get clipboard items
          const items = event.clipboardData?.items;
          if (!items) return;

          // Look for file items in clipboard
          for (const item of items) {
            if (item.kind === 'file') {
              const file = item.getAsFile();
              if (!file) continue;

              // Check if file type is supported
              const isSupported = [
                'application/pdf',
                'image/png',
                'image/jpeg',
                'image/webp',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
                'text/plain'
              ].includes(file.type);

              if (!isSupported) {
                this.showToast('File type not supported', 'error');
                return;
              }

              // Process the file
              this.isUploading = true;
              try {
                await this.processFile(file);
                this.showToast('File uploaded successfully', 'success');
              } catch (error) {
                console.error('Error processing pasted file:', error);
                this.showToast('Error processing file', 'error');
              } finally {
                this.isUploading = false;
              }
              break; // Only process the first valid file
            }
          }
        }
      };
    });
  });
}

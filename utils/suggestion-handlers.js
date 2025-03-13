export const suggestionHandlers = {
  applyInvoiceSuggestions: async function(suggestions) {
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

      // Update the invoice with the new payload
      this.updateInvoice({
        type: this.invoiceManager.UPDATE_TYPES.FULL,
        payload: fullPayload
      });
      
      if (cleanSuggestions.paymentLink) {
        this.generateQrCode();
      }

      if (Alpine.store('workspace').isNewPage == true) {
        await this.animateOut();
        Alpine.store('workspace').isNewPage = false;
        await this.animateIn();
      }
    } catch (error) {
      console.error('Error applying suggestions:', error);
    }
  },

  summarizeChanges: function(suggestions, currentInvoice) {
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
  }
}; 
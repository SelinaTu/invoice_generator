const invoicePreviewTemplate = await Deno.readTextFile(new URL('./templates/invoice-preview.html', import.meta.url));

export const formatNumber = (number) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number || 0);
};


export const generateId = () => {
  return Math.random().toString(36).substring(2, 15);
};


export const createInvoiceManager = () => {
  const UPDATE_TYPES = {
    TAX: 'tax',
    ITEM: 'item',
    PAYMENT_TERMS: 'paymentTerms',
    TEXT: 'text',
    ITEMS: 'items',
    FULL: 'full',
    RECEIPT: 'receipt',
    MODE: 'mode'
  };

  const handleUpdate = (invoice, { type, payload }) => {
    // Create a plain object copy without any complex properties
    let updatedInvoice = JSON.parse(JSON.stringify({ ...invoice }));

    // Ensure ID exists
    if (!updatedInvoice.id) {
      updatedInvoice.id = 'INV-' + Date.now();
    }

    // Ensure items array exists and is valid at the start
    updatedInvoice.items = Array.isArray(updatedInvoice.items)
      ? updatedInvoice.items
      : [{ description: '', quantity: 1, price: 0, total: 0, taxAmount: 0, subtotal: 0 }];

    switch (type) {
      case UPDATE_TYPES.TAX:
        // Handle tax updates
        const tax = parseFloat(payload) || 0;
        updatedInvoice.tax = tax;
        updatedInvoice.items = updatedInvoice.items.map(item => {
          const total = (item.quantity || 0) * (item.price || 0);
          return {
            ...item,
            total,
            taxAmount: (total * tax) / 100
          };
        });
        break;

      case UPDATE_TYPES.ITEM:
        // Handle individual item updates
        const { index, item } = payload;
        const quantity = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.price) || 0;
        const total = quantity * price;
        const taxAmount = (total * updatedInvoice.tax) / 100;

        updatedInvoice.items[index] = {
          ...item,
          quantity,
          price,
          total,
          taxAmount,
          subtotal: total + taxAmount
        };
        break;

      case UPDATE_TYPES.PAYMENT_TERMS:
        // Handle payment terms updates
        const { terms } = payload;
        updatedInvoice.paymentTerms = terms;

        if (terms !== 'specific') {
          const today = new Date();
          let dueDate = new Date(today);

          switch (terms) {
            case 'receipt': break;
            case '15days': dueDate.setDate(today.getDate() + 15); break;
            case '30days': dueDate.setDate(today.getDate() + 30); break;
          }

          updatedInvoice.dueDate = dueDate.toISOString().split('T')[0];
        }
        break;

      case UPDATE_TYPES.TEXT:
        const { field, value } = payload;
        updatedInvoice[field] = value;
        break;

      case UPDATE_TYPES.ITEMS:
        // Ensure payload is an array and contains valid items
        updatedInvoice.items = (Array.isArray(payload) ? payload : []).map(item => ({
          description: item.description || '',
          quantity: parseFloat(item.quantity) || 0,
          price: parseFloat(item.price) || 0,
          total: (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0),
          taxAmount: ((parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0) * (updatedInvoice.tax || 0)) / 100,
          subtotal: 0  // Will be calculated after tax
        }));
        break;

      case UPDATE_TYPES.FULL:
        updatedInvoice = { ...updatedInvoice, ...payload };
        // Clean empty items
        updatedInvoice.items = updatedInvoice.items.filter(item =>
          item.description || item.quantity > 0 || item.price > 0
        );
        // Ensure there's always at least one item
        if (updatedInvoice.items.length === 0) {
          updatedInvoice.items = [{ description: '', quantity: 1, price: 0, total: 0, taxAmount: 0, subtotal: 0 }];
        }
        break;

      case UPDATE_TYPES.MODE:
        updatedInvoice.mode = payload;
        // Update number prefix based on mode
        if (payload === 'receipt') {
          updatedInvoice.number = updatedInvoice.number.replace('INV-', 'RCP-');
        } else {
          updatedInvoice.number = updatedInvoice.number.replace('RCP-', 'INV-');
        }
        break;

      case UPDATE_TYPES.RECEIPT:
        updatedInvoice.receipt = {
          ...updatedInvoice.receipt,
          ...payload
        };
        break;
    }

    // Recalculate totals unless it's a text-only update
    if (type !== UPDATE_TYPES.TEXT) {
      // console.log('>> updatedInvoice:', JSON.stringify(updatedInvoice));
      const subtotal = updatedInvoice.items.reduce((sum, item) => sum + (item.total || 0), 0);
      const totalTaxAmount = updatedInvoice.items.reduce((sum, item) => sum + (item.taxAmount || 0), 0);

      updatedInvoice.subtotal = subtotal;
      updatedInvoice.taxAmount = totalTaxAmount;
      updatedInvoice.total = subtotal + totalTaxAmount;
    }

    return updatedInvoice;
  };

  const handleFileUpload = async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/process-file", {
        method: "POST",
        body: formData
      });

      if (!response.ok) throw new Error("Upload failed");
      return await response.json();
    } catch (error) {
      console.error("File upload error:", error);
      throw error;
    }
  };

  const defaultInvoice = () => {
    const invoice = {
      id: 'INV-' + Date.now(),
      mode: 'invoice',
      number: 'INV-' + new Date().getTime().toString().slice(-4),
      date: new Date().toISOString().split('T')[0],
      dueDate: dayjs().add(30, 'days').format('YYYY-MM-DD'),
      currency: 'USD',
      tax: 0,
      customer: '',
      items: [{ description: '', quantity: 1, price: 0, total: 0, taxAmount: 0, subtotal: 0 }],
      issuer: '',
      logoUrl: '',
      paymentLink: '',
      subtotal: 0,
      taxAmount: 0,
      total: 0,
      paymentTerms: '30days',
      paymentInstructions: '',
      message: '',
      qrCodeSvg: '',
      receipt: {
        paymentDate: '',
        paymentMethod: '',
        transactionId: '',
        notes: '',
        status: 'pending'
      }
    };
    
    // Return a plain object copy
    return JSON.parse(JSON.stringify(invoice));
  };

  return {
    UPDATE_TYPES,
    handleUpdate,
    defaultInvoice,
    handleFileUpload
  };
};


export const getDemoInvoice = () => {
  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(today.getDate() + 30);

  const items = [
    {
      description: 'Premium Meyer Lemons Supply (400 lbs)',
      quantity: 2,
      price: 600,
      total: 1200,
      taxAmount: 48,  // 4% of 1200
      subtotal: 1248
    },
    {
      description: 'Cold Chain Delivery Fee',
      quantity: 1,
      price: 150,
      total: 150,
      taxAmount: 6,   // 4% of 150
      subtotal: 156
    },
    {
      description: 'Organic Certification Premium',
      quantity: 1,
      price: 250,
      total: 250,
      taxAmount: 10,  // 4% of 250
      subtotal: 260
    }
  ];

  const invoice = {
    id: 'DEMO-' + Date.now(),
    mode: 'receipt',
    number: 'RCP-FRESH',
    date: today.toISOString().split('T')[0],
    currency: 'USD',
    tax: 4,
    customer: 'Citrus & Fresh Grocery Chain\nAttn: Accounts Payable\n789 Retail Plaza\nSuite 500\nLos Angeles, CA 90017\nUnited States',
    items: items,
    subtotal: 1600,
    taxAmount: 66,
    total: 1666,
    paymentTerms: 'receipt',
    dueDate: dueDate.toISOString().split('T')[0],
    paymentInstructions: 'Please make payment via bank transfer to:\nBank: First Agricultural Bank\nAccount: 1234567890\nRouting: 987654321\nAccount Name: Sunny Grove Citrus LLC',
    issuer: 'Sunny Grove Citrus LLC\nLucy Lemon, Owner\n456 Citrus Valley Road\nGrove District\nVentura, CA 93001\nUnited States\nFederal Tax ID (EIN): 12-3456789',
    logoUrl: 'https://images.unsplash.com/photo-1534531173927-aeb928d54385?q=80&w=400&h=200&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    paymentLink: 'https://example.com/pay/demo-invoice',
    message: "Thank you for choosing Sunny Grove Citrus! We take pride in delivering the finest organic Meyer lemons to your stores. Your business means the world to us. 🍋✨",
    receipt: {
      paymentDate: today.toISOString().split('T')[0],
      paymentMethod: 'bank',
      transactionId: 'WIRE-12345678',
      notes: 'Payment received via wire transfer from Citrus & Fresh Grocery Chain.\nReference: PO-2024-0123',
      status: 'paid'
    }
  };
  
  // Return a plain object copy
  return JSON.parse(JSON.stringify(invoice));
};


export const generateReceiptDetailsHtml = (invoice, formattedPaymentDate) => {
  if (invoice.mode !== 'receipt' || !invoice.receipt) return '';
  
  return `
    <div style="margin: 1rem 0;">
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem;">
        <div style="margin-bottom: 1rem;">
          <h4 style="color: #333; font-size: 0.875rem; margin: 0; font-weight: normal;">Payment Date</h4>
          <p style="margin: 0; font-weight: 500;">${formattedPaymentDate}</p>
        </div>
        <div style="margin-bottom: 1rem;">
          <h4 style="color: #333; font-size: 0.875rem; margin: 0; font-weight: normal;">Payment Method</h4>
          <p style="margin: 0; font-weight: 500;">${invoice.receipt.paymentMethod.charAt(0).toUpperCase() + invoice.receipt.paymentMethod.slice(1)}</p>
        </div>
        <div style="margin-bottom: 1rem;">
          <h4 style="color: #333; font-size: 0.875rem; margin: 0; font-weight: normal;">Transaction ID</h4>
          <p style="margin: 0; font-weight: 500;">${invoice.receipt.transactionId}</p>
        </div>
      </div>
      ${invoice.receipt.notes ? `
        <div style="margin-top: 0.5rem;">
          <h4 style="color: #333; font-size: 0.875rem; margin: 0; font-weight: normal;">Additional Notes</h4>
          <p style="margin: 0; white-space: pre-line">${invoice.receipt.notes}</p>
        </div>
      ` : ''}
    </div>
  `;
};


export const generateInvoicePreviewHtml = function(invoice, template) {
  // In browser context, use this.invoicePreviewTemplate if no template provided
  const templateToUse = template || (this && this.invoicePreviewTemplate);
  if (!templateToUse) return 'No template provided';

  const formattedDueDate = dayjs(invoice.dueDate).format('D MMMM YYYY');
  const formattedIssueDate = dayjs(invoice.date).format('D MMMM YYYY');
  const formattedPaymentDate = invoice.receipt?.paymentDate ? 
    dayjs(invoice.receipt.paymentDate).format('D MMMM YYYY') : '';

  const replacements = {
    '{{documentType}}': invoice.mode === 'receipt' ? 'Receipt' : 'Invoice',
    '{{invoiceNumber}}': invoice.number || '',
    '{{formattedIssueDate}}': formattedIssueDate,
    '{{issuer}}': invoice.issuer || '',
    '{{customer}}': invoice.customer || '',
    '{{currency}}': invoice.currency || 'USD',
    '{{taxRate}}': invoice.tax || '0',
    '{{formattedSubtotal}}': formatNumber(invoice.subtotal),
    '{{formattedTaxAmount}}': formatNumber(invoice.taxAmount),
    '{{formattedTotal}}': formatNumber(invoice.total),
    '{{paymentInstructions}}': invoice.paymentInstructions || '',

    // HTML blocks
    '{{logoHtml}}': invoice.logoUrl ? `
      <div class="logo">
        <img src="${invoice.logoUrl}" alt="Company logo">
      </div>
    ` : '',

    '{{dueDateLine}}': invoice.mode === 'receipt' ? 
      `<span>paid</span> <span>on</span> <span>${formattedPaymentDate}</span>` : 
      `<span>due</span> <span>by</span> <span>${formattedDueDate}</span>`,

    '{{messageHtml}}': invoice.message ? `
      <p style="color: #333; margin-top: 0.5rem; font-style: italic; line-height: 1.6;">
        ${invoice.message}
      </p>
    ` : '',

    '{{itemsHtml}}': (invoice.items || []).map(item => `
      <tr>
        <td style="text-align: left; padding-left: 0rem;">${item.description || ''}</td>
        <td>${item.quantity || 0}</td>
        <td>${formatNumber(item.price)}</td>
        <td style="text-align: right; padding-right: 0rem;">${formatNumber(item.total)}</td>
        <td style="text-align: right; padding-right: 0rem;">${formatNumber(item.total + (item.taxAmount || 0))}</td>
      </tr>
    `).join(''),

    '{{qrCodeHtml}}': invoice.paymentLink && invoice.qrCodeSvg ? `
      <div class="payment-qr">
        <div style="margin-top: 1rem; margin-bottom: 1rem; width: 150px; line-height: 0;" class="qr-code">
          ${invoice.qrCodeSvg}
        </div>
        <br>
      </div>
    ` : '',

    '{{paymentLinkHtml}}': invoice.paymentLink ? `
      <p style="margin-bottom: 1rem; text-decoration: underline; color: black;">${invoice.paymentLink}</p>
    ` : '',

    '{{receiptDetailsHtml}}': generateReceiptDetailsHtml(invoice, formattedPaymentDate)
  };

  // Use the template we found
  let html = templateToUse;
  
  // Simple string replacement
  for (const [placeholder, value] of Object.entries(replacements)) {
    html = html.split(placeholder).join(value || '');
  }
  
  return html;
};




export const previewHandlers = {
  previewInvoice: async function() {
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

  createInvoice: async function() {
    if (this.isUpdating) return;
    try {
      await this.previewInvoice();
    } catch (error) {
      console.error('Error creating invoice:', error);
      alert('Failed to create invoice');
    }
  },

  downloadPdf: async function() {
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
          console.log('fetching logo for PDF:', this.invoice.logoUrl);
          const logoImg = container.querySelector('.logo img');
          if (logoImg) {
            // Use the proxy endpoint instead of direct fetch
            const response = await fetch('/proxy-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: this.invoice.logoUrl })
            });
            
            if (!response.ok) {
              console.warn('Failed to fetch logo:', response);
              return;
            }
            
            const data = await response.json();
            if (data.error) {
              console.warn('Failed to proxy logo:', data.error);
              return;
            }
            
            logoImg.src = data.base64;
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

  // Helper method for invoice/receipt preview
  generateInvoicePreviewHtml: function() {
    return this.invoice.mode === 'receipt'
      ? generateReceiptPreviewHtml(this.invoice)
      : generateInvoicePreviewHtml(this.invoice);
  },

  generateQrCode: async function() {
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
  }
}; 
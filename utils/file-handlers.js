// File handling methods for Alpine components
export const fileHandlers = {
  handleFileSelect: async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    this.isUploading = true;
    try {
      await this.processFile(file);
    } finally {
      this.isUploading = false;
    }
  },

  handleFileDrop: async function(event) {
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

  processFile: async function(file) {
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

  renderPdfToCanvas: async function(file) {
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

  handleClipboardPaste: async function(event) {
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
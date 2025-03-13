# Fresh Invoices 🍋

A lightweight, browser-based invoice generator with AI assistance.

**[Try it now at fresh.labspace.ai](https://fresh.labspace.ai)**

## About

Fresh Invoices is a fully functional, browser-based invoice generator that helps you create professional invoices quickly and easily. It was born from a simple need: creating invoices without being tied to payment services like Stripe or Wise.

With Fresh Invoices, you can:

- Create invoices from scratch or from templates
- Upload existing invoice PDFs for AI analysis
- Generate invoice details from natural language descriptions
- Save invoices locally in your browser
- Export invoices as PDFs
- Duplicate and modify previous invoices
- Track payment status with receipt mode

## Features

### AI-Powered Invoice Generation
Simply describe what you need ("Create an invoice for 3 hours of web development at $95/hr") and the AI will generate a complete invoice with appropriate line items, taxes, and payment details.

### PDF Upload and Analysis
Upload existing invoice PDFs and the AI will extract relevant information to create a new invoice based on the uploaded document.

### Local-First Storage
All data stays in your browser. No server-side storage means your invoice data remains private and accessible even offline.

### Undo/Redo Support
Built with Alpine.js and Immer for robust state management, allowing you to easily undo and redo changes as you work.

### Receipt Mode
Toggle between invoice and receipt modes to track payment status and details.

### QR Code Generation
Automatically generate QR codes for payment links to make it easier for clients to pay.

### PDF Export
Export your invoices as professional PDF documents ready to be shared with clients.

## Technical Details

- Built with Alpine.js for a reactive UI without heavy frameworks
- Uses Immer for immutable state management and undo/redo functionality
- Powered by Groq for fast and accurate AI inference
- Stores data in IndexedDB for persistent local storage
- Generates QR codes for payment links
- Exports to PDF with html2pdf.js

## Why Groq?

Fresh Invoices uses Groq for AI inference because:

1. It's extremely fast, providing near-instant responses
2. It's virtually free for the level of inferencing needed
3. It adheres to JSON output formats very well, making it ideal for structured data like invoices
4. It provides high-quality text analysis for PDF uploads

## Development

The project is organized into modular components:
- Alpine.js modules for UI reactivity
- Utility handlers for different functionality (file handling, chat, invoice management, etc.)
- HTML templates for rendering

## License

MIT Licensed. Feel free to use, modify, and distribute as needed.

## Source Code

The complete source code is available at [github.com/janzheng/fresh](https://github.com/janzheng/fresh)

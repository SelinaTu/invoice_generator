const systemPrompt = `You are an invoice/receipt assistant. Help users by suggesting data in JSON format.
Always respond with valid JSON that matches this schema:
{
  "thinking": "string — use this part to explain your thinking and reasoning",
  "suggestions": {
    "mode": "invoice|receipt",
    "number": "INV-XXXX or RCP-XXXX",
    "date": "YYYY-MM-DD",
    "dueDate": "YYYY-MM-DD",
    "currency": "USD",
    "tax": 0,
    "items": [
      {
        "description": "string",
        "quantity": number,
        "price": number
      }
    ],
    "issuer": "string — Company/person issuing document, including company name, address, city, state/province, postal code, and country, as well as tax/registration numbers like EIN, VAT, or GST",
    "customer": "string — Company/person details, including company name, attn, department, address, city, state/province, postal code, and country, as well as tax/registration numbers like EIN, VAT, or GST. Appears under Billed To.",
    "logoUrl": "string",
    "paymentLink": "string",
    "paymentTerms": "30days|15days|receipt|specific",
    "paymentInstructions": "string",
    "message": "string",
    "receipt": {
      "paymentDate": "YYYY-MM-DD",
      "paymentMethod": "cash|credit|debit|bank|check|crypto|other",
      "transactionId": "string",
      "notes": "string",
      "status": "pending|paid|cancelled"
    }
  },
  "explanation": "string"
}

Guidelines for generating suggestions:
1. Keep existing values unless explicitly asked to change them
2. For currency, use: USD, EUR, GBP, CNY, JPY, CAD, AUD, NZD, HKD, SGD, KRW, TWD, INR, CHF, SEK, NOK, DKK, PLN, HUF, ILS, SAR, BRL, MXN, COP, CLP, UYU, ARS
3. For payment terms, use: "30days", "15days", "receipt", or "specific"
4. Tax should be a percentage between 0-100
5. Dates should be in YYYY-MM-DD format
6. Document numbers should start with:
   - "INV-" for invoices
   - "RCP-" for receipts
7. Items should include clear, detailed descriptions with specific quantity and price
8. Logo URL and payment link should be valid URLs or empty strings
9. If you're suggesting a logo URL, prefer using this service, e.g. https://placecats.com/200x100 unless otherwise specified

Receipt-specific guidelines:
1. When in receipt mode:
   - Set mode to "receipt"
   - Update number prefix to RCP-
   - Include payment date, method, and transaction ID
   - Set status to "paid" by default
   - Payment method should be one of: cash, credit, debit, bank, check, crypto, other
2. When analyzing receipts:
   - Extract payment method and date if available
   - Look for transaction IDs or reference numbers
   - Note any payment-specific details in receipt.notes
   - Include cashier/terminal info if present

Guidelines when given uploaded OCR text data for analysis:
1. When analyzing business documents:
   - Determine if it's an invoice or receipt based on content
   - For receipts, look for payment confirmation details
   - Extract payment method and transaction IDs
   - Note any return/refund policies
   - Capture timestamps and register/terminal info

2. For address and contact details:
   - Keep company headers as displayed
   - Preserve attention lines and departments
   - Maintain address formatting and line breaks
   - Include business IDs in original format
   - Keep contact details in source order

3. For line items and pricing:
   - Copy item descriptions exactly, including parentheses
   - Keep original units and quantities
   - Preserve price formatting
   - Maintain existing tax calculations
   - Keep item order as shown

Remember to:
- Preserve original formatting and punctuation
- Keep existing dates and reference numbers
- Maintain source document layout
- Copy text exactly as presented
- Preserve line breaks using \\n characters`;

const visionSystemPrompt = `You are an invoice/receipt assistant analyzing images. Suggest data in JSON format using this schema:
{
  "thinking": "Use this to explain your visual analysis process",
  "suggestions": {
    "mode": "invoice|receipt (determine from content)",
    "number": "INV-XXXX or RCP-XXXX",
    "date": "YYYY-MM-DD",
    "dueDate": "YYYY-MM-DD",
    "currency": "USD|EUR|GBP|CNY|JPY|CAD|AUD|NZD|HKD|SGD|KRW|TWD|INR|CHF|SEK|NOK|DKK|PLN|HUF|ILS|SAR|BRL|MXN|COP|CLP|UYU|ARS",
    "tax": "0-100",
    "customer": "Company/person details, including company name, attn, department, address, city, state/province, postal code, and country, as well as tax/registration numbers like EIN, VAT, or GST. Appears under Billed To.",
    "items": [
      {
        "description": "Item description",
        "quantity": "Numeric quantity",
        "price": "Price per unit"
      }
    ],
    "issuer": "Company/person issuing document, including company name, address, city, state/province, postal code, and country, as well as tax/registration numbers like EIN, VAT, or GST",
    "logoUrl": "URL of company logo if visible",
    "paymentLink": "Payment URL if present",
    "paymentTerms": "30days|15days|receipt|specific",
    "paymentInstructions": "Banking/payment details",
    "message": "Additional notes that appears under the invoice amount, usually a thank you message",
    "receipt": {
      "paymentDate": "YYYY-MM-DD",
      "paymentMethod": "Payment method used",
      "transactionId": "Transaction reference",
      "notes": "Additional payment details",
      "status": "Payment status"
    }
  },
  "explanation": "Summarize findings"
}

When analyzing images:
1. Determine if the document is an invoice or receipt
2. For receipts, look for:
   - Payment method used
   - Transaction ID/reference numbers
   - Terminal/register information
   - Cashier details
   - Timestamp of payment
3. Preserve original text formatting and line breaks using \\n
4. Keep exact item descriptions, quantities, and prices as shown
5. Maintain all business identifiers and contact details
6. Copy payment instructions verbatim
7. Extract dates in YYYY-MM-DD format`;

import { qrcode } from "jsr:@libs/qrcode";
import mammoth from 'npm:mammoth@1.6.0';
import pdf2md from 'npm:@opendocsg/pdf2md@0.1.31';
// import { encodeBase64 } from "jsr:@std/encoding";

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

export const generateQrCode = async (c) => {
  const { paymentLink } = await c.req.json();
  
  if (!paymentLink) {
    return c.json({ error: "Payment link is required" });
  }

  const svg = qrcode(paymentLink, {
    output: "svg", 
    color: {
      dark: "#000000",
      light: "#ffffff"
    },
    border: 0
  });

  return c.json({ svg });
};

export const chatMiddleware = async (c, next) => {
  const { message, currentInvoice, fileContext } = await c.req.json();
  
  // Allow empty message if there's a file context
  if (!message && !fileContext) {
    return c.json({ error: "Either message or file is required" }, 400);
  }

  // console.log('>> currentInvoice:', currentInvoice, message);
  // console.log('>> fileContext:', fileContext);

  // Clean up empty items before sending to model
  const cleanInvoice = currentInvoice ? {
    ...currentInvoice,
    items: currentInvoice.items.filter(item => 
      item.description || item.quantity > 0 || item.price > 0
    )
  } : null;

  if (!GROQ_API_KEY) {
    return c.json({ error: "GROQ_API_KEY not configured" }, 500);
  }

  try {
    const messages = [
      {
        role: "system",
        content: systemPrompt
      },
      ...(cleanInvoice ? [{
        role: "assistant",
        content: JSON.stringify({ currentState: cleanInvoice })
      }] : []),
    ];

    // Add file context if present
    if (fileContext?.content) {
      messages.push({
        role: "user",
        content: `Here's the content from file "${fileContext.filename}":\n\n${fileContext.content}`
      });
      
      // If we have vision analysis, add it as well
      if (fileContext.visionAnalysis) {
        messages.push({
          role: "assistant",
          content: `I've analyzed the image and found this information:\n${JSON.stringify(fileContext.visionAnalysis, null, 2)}`
        });
      }

      // If no message was provided, add a default analysis request
      if (!message) {
        messages.push({
          role: "user",
          content: "Please analyze this file and suggest appropriate invoice details based on its content."
        });
      }
    }

    // Add user message if provided
    if (message) {
      messages.push({ role: "user", content: message });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages,
        response_format: { type: "json_object" },
        temperature: 0.0,
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.choices?.[0]?.message?.content) {
      throw new Error("Invalid response from Groq API");
    }

    const parsedContent = JSON.parse(data.choices[0].message.content);

    if (parsedContent.thinking) {
      console.log('>> thinking:', parsedContent.thinking);
    }

    // Ensure suggestions exists
    if (!parsedContent.suggestions) {
      parsedContent.suggestions = {};
    }

    // Ensure and validate items array
    if (parsedContent.suggestions) {
      // Make sure items is an array
      const items = Array.isArray(parsedContent.suggestions.items) 
        ? parsedContent.suggestions.items 
        : [];

      // Map and validate each item
      parsedContent.suggestions.items = items
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          description: item.description || '',
          quantity: Math.max(0, parseFloat(item.quantity) || 0),
          price: Math.max(0, parseFloat(item.price) || 0),
          total: 0,  // These will be calculated by invoice manager
          taxAmount: 0,
          subtotal: 0
        }))
        .filter(item => 
          item.description && 
          (item.quantity > 0 || item.price > 0)
        );
    }

    // Validate required fields
    const requiredFields = [
      'number', 'date', 'dueDate', 'currency', 'tax', 
      'customer', 'issuer', 'paymentTerms', 'message'
    ];

    for (const field of requiredFields) {
      if (parsedContent.suggestions[field] === undefined) {
        parsedContent.suggestions[field] = currentInvoice?.[field] || '';
      }
    }

    console.log('>> parsedContent:', parsedContent, typeof parsedContent);
    
    return c.json(parsedContent);
  } catch (error) {
    console.error("Chat error:", error);
    return c.json({ 
      error: error.message,
      suggestions: null,
      explanation: "Sorry, I encountered an error processing your request. Please try again."
    }, 500);
  }
};

export const processFile = async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file");
    const pdfCanvasPages = formData.get("pdfCanvasPages");
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file provided" }, 400);
    }

    // Add debug logging for file info
    console.log('>> File info:', {
      name: file.name,
      type: file.type,
      size: file.size,
      hasCanvasPages: !!pdfCanvasPages
    });

    const originalBuffer = await file.arrayBuffer();
    let content = "";
    let isImage = file.type.startsWith('image/');

    // Add debug logging for content type detection
    console.log('>> Content detection:', {
      isPDF: file.name.toLowerCase().endsWith('.pdf'),
      isImage,
      bufferSize: originalBuffer.byteLength
    });

    if (file.name.toLowerCase().endsWith('.pdf')) {
      try {
        content = await pdf2md(new Uint8Array(originalBuffer.slice(0)));
        console.log('>> PDF content length:', content.length);
        
        // If PDF text content is too short and we have canvas pages, process them
        if ((!content || content.length < 20) && pdfCanvasPages) {
          const canvasPages = JSON.parse(pdfCanvasPages);
          
          // Process each canvas page with Vision API
          const visionResults = await Promise.all(canvasPages.map(async (dataUrl, index) => {
            // Extract base64 data from dataURL
            const base64Image = dataUrl.split(',')[1];
            
            const visionPayload = {
              model: "llama-3.2-90b-vision-preview",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `Analyze page ${index + 1} of this invoice. ${visionSystemPrompt}`
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:image/jpeg;base64,${base64Image}`
                      }
                    }
                  ]
                }
              ],
              temperature: 0.7,
              max_tokens: 1000
            };

            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify(visionPayload)
            });

            if (!response.ok) {
              throw new Error(`Vision API error: ${response.status}`);
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || "";
          }));

          // Combine vision results with original content
          content = [content, ...visionResults].filter(Boolean).join("\n\n");
        }
      } catch (err) {
        console.error('PDF conversion failed:', err);
        if (!content || content.length < 100) {
          isImage = true;
          console.log('>> Converting PDF to image processing');
        }
      }
    } else if (file.name.toLowerCase().endsWith('.docx')) {
      const result = await mammoth.convertToHtml({ 
        buffer: new Uint8Array(originalBuffer.slice(0)) 
      });
      content = result?.value || "";
    } else if (file.name.toLowerCase().endsWith('.txt')) {
      content = await new Response(file).text();
    }

    console.log('>> FINAL content:', content);
    return c.json({ 
      content: content.trim(),
      filename: file.name
    });
  } catch (error) {
    console.error("File processing error:", error);
    return c.json({ error: error.message }, 500);
  }
};

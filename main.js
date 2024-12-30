import { Hono } from "https://deno.land/x/hono@v3.11.7/mod.ts";
import "jsr:@std/dotenv/load";
import { generateInvoicePreviewHtml, getAlpineModule } from "./alpine-module.js";
import { generateQrCode, chatMiddleware, processFile } from "./server-helpers.js";

const mainTemplate = await Deno.readTextFile(new URL('./templates/main.html', import.meta.url));
const menuTemplate = await Deno.readTextFile(new URL('./templates/menu.html', import.meta.url));
const mainWelcomeTemplate = await Deno.readTextFile(new URL('./templates/main-welcome.html', import.meta.url));
const toastsTemplate = await Deno.readTextFile(new URL('./templates/toasts.html', import.meta.url));
const invoicePreviewTemplate = await Deno.readTextFile(new URL('./templates/invoice-preview.html', import.meta.url));

const app = new Hono();

app.post("/generate-qr", generateQrCode);
app.post("/chat", chatMiddleware);
app.post("/process-file", processFile);

export const getMainHtml = async () => {
  // Get the Alpine module content
  const alpineModule = await getAlpineModule();

  // Replace all template placeholders
  return mainTemplate
    .replace('{{menuTemplate}}', menuTemplate)
    .replace('{{mainWelcomeTemplate}}', mainWelcomeTemplate)
    .replace('{{toastsTemplate}}', toastsTemplate)
    .replace('{{alpineModule}}', alpineModule)
};

app.get("/", async (c) => c.html(await getMainHtml()));

app.post("/preview", async (c) => {
  const data = await c.req.json();
  return c.html(generateInvoicePreviewHtml(data, invoicePreviewTemplate));
});

const handler = (typeof Deno !== "undefined" && Deno.env.get("valtown")) ? app.fetch : app;
export { handler as default };

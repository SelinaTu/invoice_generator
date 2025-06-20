import { Hono } from "https://deno.land/x/hono@v3.11.7/mod.ts";
import "jsr:@std/dotenv/load";
import { generateInvoicePreviewHtml, getAlpineModule } from "./alpine.js";
import { generateQrCode, chatMiddleware, processFile, proxyImage } from "./server/index.js";

const mainTemplate = await Deno.readTextFile(new URL('./templates/main.html', import.meta.url));
const menuTemplate = await Deno.readTextFile(new URL('./templates/partials/menu.html', import.meta.url));
const mainWelcomeTemplate = await Deno.readTextFile(new URL('./templates/partials/main-welcome.html', import.meta.url));
const toastsTemplate = await Deno.readTextFile(new URL('./templates/partials/toasts.html', import.meta.url));
const invoicePreviewTemplate = await Deno.readTextFile(new URL('./templates/partials/invoice-preview.html', import.meta.url));

const app = new Hono();

app.post("/generate-qr", generateQrCode);
app.post("/chat", chatMiddleware);
app.post("/process-file", processFile);
app.post("/proxy-image", proxyImage);

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
app.get("/", async (c) => {
  const html = await getMainHtml();
  return c.html(html);
});

app.post("/preview", async (c) => {
  const data = await c.req.json();
  return c.html(generateInvoicePreviewHtml(data, invoicePreviewTemplate));
});

const handler = (typeof Deno !== "undefined" && Deno.env.get("valtown")) ? app.fetch : app;
export { handler as default };

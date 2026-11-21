import fs from "node:fs/promises";
const { account: { recoveryEmail: copy } } = JSON.parse(await fs.readFile(new URL("../src/i18n/locales/en.json", import.meta.url), "utf8"));
const escape = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const html = `<!-- Generated from src/i18n/locales/en.json by scripts/build-account-email.mjs. -->
<!doctype html><html lang="en"><body style="margin:0;background:#111315;color:#e4e7eb;font:15px/1.6 Arial,sans-serif">
<div style="max-width:480px;margin:0 auto;padding:32px 24px">
<h1 style="font-size:22px;margin:0 0 16px">${escape(copy.title)}</h1><p>${escape(copy.instruction)}</p>
<p style="border:1px solid #454b54;border-radius:8px;padding:16px;text-align:center;font-size:28px;letter-spacing:5px;font-weight:700">{{ .Token }}</p>
<p>${escape(copy.ignore)}</p></div></body></html>\n`;
await fs.writeFile(new URL("../supabase/templates/recovery.html", import.meta.url), html);

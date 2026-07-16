/**
 * Helper per generare HTML di email transazionali con branding Vinifera.
 */

// Vinifera brand green (oklch(0.37 0.09 175) nei CSS del CRM)
const BRAND_GREEN = "#145a44";

export interface EmailOptions {
  title: string;
  body: string; // HTML interno (paragrafi)
  footerNote?: string;
  /** URL logo da Firebase Storage (settings/company.logoUrl) */
  logoUrl?: string;
  /** Numero WhatsApp formattato: "393405411749" (solo cifre, con prefisso IT) */
  whatsappNumber?: string;
}

export function buildEmailHtml({ title, body, footerNote, logoUrl, whatsappNumber }: EmailOptions): string {
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="Vinifera Studio Enologico" style="height:44px;max-width:220px;object-fit:contain;" />`
    : `<p style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Vinifera</p>
       <p style="margin:6px 0 0;color:#a7c4b8;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Studio Enologico</p>`;

  const whatsappLink = whatsappNumber
    ? `<a href="https://wa.me/${whatsappNumber}" style="color:#9ca3af;">WhatsApp</a>`
    : "WhatsApp";

  const footerText = footerNote
    ? `${escHtml(footerNote)}<br/>`
    : "";

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f2;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f2;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 1px 6px rgba(0,0,0,.10);">
          <!-- Header verde Vinifera -->
          <tr>
            <td style="background:${BRAND_GREEN};padding:28px 40px;text-align:center;">
              ${logoHtml}
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h1 style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND_GREEN};">
                ${escHtml(title)}
              </h1>
              <div style="font-size:14px;line-height:1.7;color:#374151;">
                ${body}
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                ${footerText}
                Non rispondere a questa email — per assistenza scrivici su ${whatsappLink}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}




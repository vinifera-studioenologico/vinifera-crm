/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image does not support alt prop */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image,
} from "@react-pdf/renderer";
import type { QuoteDoc } from "@/schemas/quote";
import type { CompanySettingsValues } from "@/schemas/client";

// ── Font system per compatibilità ─────────────────────────────────────
// Usa font di sistema — nessun download necessario
Font.registerHyphenationCallback((word) => [word]);

// ── Stili ─────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#111",
    padding: "40pt 48pt",
    lineHeight: 1.4,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 40,
    marginBottom: 28,
  },
  headerLeft: { flex: 1 },
  headerRight: { alignItems: "flex-end" },
  companyName: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  companyDetail: { fontSize: 8, color: "#555", lineHeight: 1.5 },
  logo: { width: 120, height: 60, objectFit: "contain" },

  // Titolo preventivo
  quoteTitle: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: "#1A4D3E",
    marginBottom: 2,
  },
  quoteMeta: { fontSize: 8.5, color: "#666" },

  // Sezione info cliente / preventivo
  infoRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 20,
    marginBottom: 20,
    padding: "12pt 14pt",
    backgroundColor: "#f2f8f5",
    borderRadius: 4,
  },
  infoBlock: { flex: 1 },
  infoLabel: { fontSize: 7, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  infoValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  infoSub: { fontSize: 8, color: "#555", marginTop: 1 },

  // Separatore
  divider: { borderBottom: "0.5pt solid #ddd", marginBottom: 12 },

  // Tabella voci
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#edf4f1",
    padding: "5pt 8pt",
    borderRadius: 3,
    marginBottom: 2,
  },
  tableHeaderText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#555", textTransform: "uppercase" },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #eee",
    padding: "6pt 8pt",
    alignItems: "flex-start",
  },
  tableRowAlt: { backgroundColor: "#fafafa" },

  colDesc: { flex: 1 },
  colQty: { width: 36, textAlign: "right" },
  colPrice: { width: 70, textAlign: "right" },
  colTotal: { width: 72, textAlign: "right" },

  itemName: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  itemSub: { fontSize: 7.5, color: "#777", marginTop: 1 },
  cellText: { fontSize: 9 },

  // Sezione totali
  totalsSection: {
    alignItems: "flex-end",
    marginTop: 12,
    marginBottom: 16,
  },
  totalsBox: { width: 200 },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalsLabel: { fontSize: 8.5, color: "#555" },
  totalsValue: { fontSize: 8.5, textAlign: "right" },
  totalsDiscountValue: { fontSize: 8.5, textAlign: "right", color: "#c0392b" },
  totalsDivider: { borderBottom: "0.5pt solid #ccc", marginVertical: 4 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderTop: "1pt solid #1A4D3E",
    marginTop: 2,
  },
  totalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  totalValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1A4D3E", textAlign: "right" },

  // Note
  notesSection: {
    marginTop: 14,
    padding: "10pt 12pt",
    backgroundColor: "#fafafa",
    borderLeft: "2pt solid #1A4D3E",
    borderRadius: 2,
  },
  notesLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#888", textTransform: "uppercase", marginBottom: 4 },
  notesText: { fontSize: 8.5, color: "#444", lineHeight: 1.5 },

  // Footer
  footerText: { fontSize: 7, color: "#999" },

  // Pagina finale — riepilogo
  summaryPage: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#111",
    padding: "40pt 48pt",
    lineHeight: 1.4,
  },
  summaryTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#1A4D3E",
    marginBottom: 20,
    borderBottom: "1pt solid #1A4D3E",
    paddingBottom: 6,
  },
  summaryTotalsBox: { width: 260, alignSelf: "flex-end", marginTop: 28 },
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 48,
  },
  signatureBlock: { width: "45%" },
  signatureLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 28,
  },
  signatureLine: { borderBottom: "0.5pt solid #999" },

  // Badge stato
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    alignSelf: "flex-end",
    marginTop: 4,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────
function formatEurPdf(cents: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function formatDatePdf(ts: unknown): string {
  if (!ts) return "—";
  const d =
    typeof ts === "object" && ts !== null && "toDate" in ts
      ? (ts as { toDate: () => Date }).toDate()
      : new Date(ts as string);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Bozza",
  pending_approval: "In attesa approvazione",
  approved: "Approvato",
  rejected: "Rifiutato",
  cancelled: "Annullato",
};

// ── Componente PDF ────────────────────────────────────────────────────
interface Props {
  quote: QuoteDoc;
  company: CompanySettingsValues | null;
}

export function QuotePdfDocument({ quote, company }: Props) {
  const snap = quote.clientSnapshot;

  // Footer note aziendale
  const footerNote =
    company?.pdfFooterNote ||
    (company
      ? `${company.legalName} · P.IVA ${company.vatNumber} · ${company.email}`
      : "");

  // Pre-calcola importi sconti in cascata (evita mutazione in render)
  const discountAmounts = quote.discounts.reduce<{ amounts: number[]; running: number }>(
    (acc, d) => {
      const amtCents = d.type === "percent"
        ? Math.round((acc.running * d.value) / 100)
        : d.value;
      return { amounts: [...acc.amounts, amtCents], running: acc.running - amtCents };
    },
    { amounts: [], running: quote.subtotalCents },
  ).amounts;

  return (
    <Document
      title={`Preventivo ${quote.number}`}
      author={company?.legalName ?? "Vinifera Lab"}
      subject={`Preventivo ${quote.number} — ${snap.displayName}`}
      creator="Vinifera CRM"
    >
      <Page size="A4" style={S.page}>
        {/* ── HEADER ── */}
        <View style={S.header}>
          {/* Sinistra: logo */}
          <View style={S.headerLeft}>
            {company?.logoUrl ? (
              <Image src={company.logoUrl} style={S.logo} />
            ) : null}
          </View>

          {/* Destra: dati azienda */}
          <View style={S.headerRight}>
            <Text style={S.companyName}>{company?.displayName ?? "Laboratorio"}</Text>
            {company && (
              <>
                <Text style={[S.companyDetail, { textAlign: "right" }]}>
                  {[company.address.street, company.address.zip, company.address.city]
                    .filter(Boolean)
                    .join(" · ")}
                  {company.address.province ? ` (${company.address.province})` : ""}
                </Text>
                <Text style={[S.companyDetail, { textAlign: "right" }]}>P.IVA {company.vatNumber}</Text>
                <Text style={[S.companyDetail, { textAlign: "right" }]}>{company.email}</Text>
                {company.pec && <Text style={[S.companyDetail, { textAlign: "right" }]}>PEC {company.pec}</Text>}
              </>
            )}
          </View>
        </View>

        {/* ── INFO CLIENTE / PREVENTIVO ── */}
        <View style={S.infoRow}>
          <View style={S.infoBlock}>
            <Text style={S.infoLabel}>Cliente</Text>
            <Text style={S.infoValue}>{snap.displayName}</Text>
            {snap.email && <Text style={S.infoSub}>{snap.email}</Text>}
            {snap.vatNumber && <Text style={S.infoSub}>P.IVA {snap.vatNumber}</Text>}
            {snap.taxCode && <Text style={S.infoSub}>C.F. {snap.taxCode}</Text>}
          </View>

          {snap.address && (
            <View style={S.infoBlock}>
              <Text style={S.infoLabel}>Indirizzo</Text>
              <Text style={S.infoValue}>{snap.address.street}</Text>
              <Text style={S.infoSub}>
                {[snap.address.zip, snap.address.city]
                  .filter(Boolean)
                  .join(" ")}
                {snap.address.province ? ` (${snap.address.province})` : ""}
              </Text>
            </View>
          )}

          {company?.iban && (
            <View style={S.infoBlock}>
              <Text style={S.infoLabel}>Dati bancari</Text>
              <Text style={S.infoSub}>{company.bankName ?? ""}</Text>
              <Text style={[S.infoSub, { fontFamily: "Helvetica-Bold", fontSize: 7.5 }]}>
                {company.iban}
              </Text>
            </View>
          )}

          <View style={{ alignItems: "flex-end", justifyContent: "center" }}>
            <Text style={S.quoteTitle}>PREVENTIVO</Text>
            <Text style={[S.quoteTitle, { fontSize: 14, marginTop: 4 }]}>N° {quote.number}</Text>
            <Text style={S.quoteMeta}>Emesso il {formatDatePdf(quote.issuedAt)}</Text>
            {quote.validUntil && (
              <Text style={S.quoteMeta}>Valido fino al {formatDatePdf(quote.validUntil)}</Text>
            )}
            <View
              style={[
                S.badge,
                {
                  backgroundColor:
                    quote.status === "approved"
                      ? "#d1fae5"
                      : quote.status === "rejected" || quote.status === "cancelled"
                        ? "#fee2e2"
                        : "#fef3c7",
                  color:
                    quote.status === "approved"
                      ? "#065f46"
                      : quote.status === "rejected" || quote.status === "cancelled"
                        ? "#991b1b"
                        : "#92400e",
                },
              ]}>
              <Text>{STATUS_LABELS[quote.status] ?? quote.status}</Text>
            </View>
          </View>
        </View>

        {/* ── TABELLA VOCI ── */}
        {/* Intestazioni colonne */}
        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderText, S.colDesc]}>Descrizione</Text>
          <Text style={[S.tableHeaderText, S.colQty]}>Q.tà</Text>
          <Text style={[S.tableHeaderText, S.colPrice]}>Prezzo unit.</Text>
          <Text style={[S.tableHeaderText, S.colTotal]}>Totale</Text>
        </View>

        {/* Righe voci */}
        {quote.items.map((item, i) => {
          const name =
            item.kind === "free"
              ? item.description
              : item.nameSnapshot;
          const lineTotal = Math.round(item.unitPriceCents * item.quantity);

          return (
            <View key={i} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
              <View style={S.colDesc}>
                <Text style={S.itemName}>{name}</Text>
                {item.kind !== "free" && (
                  <Text style={S.itemSub}>
                    {item.kind === "analysis" ? "Analisi" : "Pacchetto"}
                  </Text>
                )}
              </View>
              <Text style={[S.cellText, S.colQty]}>{item.quantity}</Text>
              <Text style={[S.cellText, S.colPrice]}>
                {formatEurPdf(item.unitPriceCents)}
              </Text>
              <Text style={[S.cellText, S.colTotal, { fontFamily: "Helvetica-Bold" }]}>
                {formatEurPdf(lineTotal)}
              </Text>
            </View>
          );
        })}

        {/* ── FOOTER ── */}
        <Text
          fixed
          style={[S.footerText, { position: "absolute", bottom: 28, right: 48 }]}
          render={({ pageNumber, totalPages }) =>
            `Pag. ${pageNumber} / ${totalPages}`
          }
        />
        <Text fixed style={[S.footerText, { position: "absolute", bottom: 14, left: 48, right: 48, textAlign: "center" }]}>
          {footerNote}
        </Text>
      </Page>

      {/* ══ PAGINA FINALE: NOTE + RIEPILOGO + FIRMA ══ */}
      <Page size="A4" style={S.summaryPage}>
        <Text style={S.summaryTitle}>Riepilogo preventivo N° {quote.number}</Text>

        {/* ── NOTE ── */}
        {quote.notes && (
          <View style={S.notesSection}>
            <Text style={S.notesLabel}>Note</Text>
            <Text style={S.notesText}>{quote.notes}</Text>
          </View>
        )}

        {/* ── TOTALI ── */}
        <View style={S.summaryTotalsBox}>
          {/* Subtotale */}
          <View style={S.totalsRow}>
            <Text style={S.totalsLabel}>Subtotale</Text>
            <Text style={S.totalsValue}>{formatEurPdf(quote.subtotalCents)}</Text>
          </View>

          {/* Sconti — pre-calcola importi in cascata */}
          {quote.discounts.map((d, i) => {
            const amt = discountAmounts[i] ?? 0;
            return (
              <View key={i} style={S.totalsRow}>
                <Text style={S.totalsLabel}>{d.label}</Text>
                <Text style={S.totalsDiscountValue}>
                  {d.type === "percent"
                    ? `−${d.value}%  (−${formatEurPdf(amt)})`
                    : `−${formatEurPdf(amt)}`}
                </Text>
              </View>
            );
          })}

          {/* Tasse applicate */}
          {quote.taxes
            .filter((t) => t.applied)
            .map((t, i) => (
              <View key={i} style={S.totalsRow}>
                <Text style={S.totalsLabel}>{t.label}</Text>
                <Text style={S.totalsValue}>+{t.percent}%</Text>
              </View>
            ))}

          <View style={S.totalsDivider} />

          {/* Totale finale */}
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>TOTALE</Text>
            <Text style={S.totalValue}>{formatEurPdf(quote.totalCents)}</Text>
          </View>
        </View>

        {/* ── FIRMA ── */}
        <View style={S.signatureRow}>
          <View style={S.signatureBlock}>
            <Text style={S.signatureLabel}>Data e luogo</Text>
            <View style={S.signatureLine} />
          </View>
          <View style={S.signatureBlock}>
            <Text style={S.signatureLabel}>Firma</Text>
            <View style={S.signatureLine} />
          </View>
        </View>

        {/* ── FOOTER ── */}
        <Text
          fixed
          style={[S.footerText, { position: "absolute", bottom: 28, right: 48 }]}
          render={({ pageNumber, totalPages }) =>
            `Pag. ${pageNumber} / ${totalPages}`
          }
        />
        <Text fixed style={[S.footerText, { position: "absolute", bottom: 14, left: 48, right: 48, textAlign: "center" }]}>
          {footerNote}
        </Text>
      </Page>
    </Document>
  );
}

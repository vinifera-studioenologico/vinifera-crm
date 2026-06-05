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
import type { CompanySettingsValues } from "@/schemas/client";
import type { SampleDoc } from "@/schemas/sample";
import type { ClientDoc } from "@/schemas/client";
import type { ClientPackageDoc } from "@/schemas/package";

Font.registerHyphenationCallback((word) => [word]);

// ── Palette B/W ───────────────────────────────────────────────────
const ACCENT = "#111827";
const BG_CLIENT = "#F3F4F6";
const BG_TABLE_HEADER = "#F3F4F6";

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
    marginBottom: 24,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  logoBox: { maxWidth: 160, height: 48, objectFit: "contain" },
  companyInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 0.5,
    borderTopColor: "#E5E7EB",
    paddingTop: 6,
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: ACCENT,
    marginBottom: 2,
  },
  companyMeta: { fontSize: 9, color: "#6B7280", lineHeight: 1.4 },
  reportLabel: {
    fontSize: 9,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  reportNumber: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: ACCENT,
    marginTop: 2,
  },
  reportInternalUse: {
    fontSize: 7.5,
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 3,
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: "#D1D5DB",
  },

  // Box cliente
  clientBox: {
    padding: "10pt 14pt",
    backgroundColor: BG_CLIENT,
    borderRadius: 4,
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  clientLabel: { fontSize: 7, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  clientName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  clientSub: { fontSize: 8.5, color: "#555", marginTop: 1 },

  // Saldo pacchetti nel box cliente (colonna DX)
  pkgSummaryBox: {
    alignItems: "flex-end",
    minWidth: 140,
  },
  pkgSummaryTitle: { fontSize: 7, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  pkgSummaryRow: { flexDirection: "row", gap: 4, marginTop: 1 },
  pkgSummaryLabel: { fontSize: 8.5, color: "#555" },
  pkgSummaryValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: ACCENT },

  // Campione card
  sampleCard: {
    marginBottom: 20,
    borderRadius: 4,
    border: "0.5pt solid #ddd",
    overflow: "hidden",
  },
  sampleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8pt 12pt",
    backgroundColor: "#E5E7EB",
  },
  sampleCode: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111" },
  sampleName: { fontSize: 9, color: "#444" },
  sampleMeta: { fontSize: 8, color: "#444", textAlign: "right" },

  // Tabella analisi con prezzi
  tableHeader: {
    flexDirection: "row",
    backgroundColor: BG_TABLE_HEADER,
    padding: "4pt 10pt",
  },
  tableHeaderText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#666", textTransform: "uppercase", textAlign: "center" },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #eee",
    padding: "5pt 10pt",
    alignItems: "center",
  },
  tableRowAlt: { backgroundColor: "#fafafa" },

  colAnalysis: { width: 90 },
  colCode: { width: 70 },
  colResult: { width: 50, textAlign: "center" },
  colUnit: { width: 30, textAlign: "center" },
  colMethod: { width: 177, textAlign: "center" },
  colPrice: { width: 62, textAlign: "center" },

  cellText: { fontSize: 8.5 },
  cellResult: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#1a1a1a", textAlign: "center" },
  cellNoResult: { fontSize: 8.5, color: "#aaa", fontStyle: "italic", textAlign: "center" },
  cellPrice: { fontSize: 8.5, fontFamily: "Helvetica-Bold", textAlign: "center" },
  cellPriceFree: { fontSize: 7.5, color: "#888", textAlign: "center", fontStyle: "italic" },

  // Subtotale campione
  sampleSubtotal: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: "5pt 10pt",
    backgroundColor: BG_CLIENT,
    gap: 8,
  },
  sampleSubtotalLabel: { fontSize: 8, color: "#555" },
  sampleSubtotalValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: ACCENT },

  // Note campione
  sampleNotes: {
    padding: "6pt 10pt",
    backgroundColor: "#F9FAFB",
    borderTop: "0.5pt solid #eee",
  },
  sampleNotesText: { fontSize: 8, color: "#666" },

  // Note referto
  reportNotes: {
    marginTop: 14,
    padding: "10pt 12pt",
    backgroundColor: "#F9FAFB",
    borderLeft: "2pt solid #D1D5DB",
    borderRadius: 2,
  },
  reportNotesLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#888",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  reportNotesText: { fontSize: 8.5, color: "#444", lineHeight: 1.5 },

  // Footer
  footerText: { fontSize: 7, color: "#999" },

  // ── Pagina firme ──────────────────────────────────────────────────
  sigPage: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#111",
    padding: "40pt 48pt",
    lineHeight: 1.4,
  },
  sigTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: ACCENT,
    marginBottom: 20,
    borderBottom: `1pt solid ${ACCENT}`,
    paddingBottom: 6,
  },
  sigTotalsBox: { width: 260, alignSelf: "flex-end", marginTop: 28 },
  sigTotalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  sigTotalsLabel: { fontSize: 8.5, color: "#555" },
  sigTotalsValue: { fontSize: 8.5, textAlign: "right" },
  sigTotalsDivider: { borderBottom: "0.5pt solid #ccc", marginVertical: 4 },
  sigTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderTop: `1pt solid ${ACCENT}`,
    marginTop: 2,
  },
  sigTotalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  sigTotalValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: ACCENT, textAlign: "right" },
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 60,
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
  signatureSub: { fontSize: 7, color: "#aaa", marginTop: 3 },
});

// ── Helpers ───────────────────────────────────────────────────────────
function formatDatePdf(ts: unknown): string {
  if (!ts) return "—";
  const d =
    typeof ts === "object" && ts !== null && "toDate" in ts
      ? (ts as { toDate: () => Date }).toDate()
      : new Date(ts as string);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

function formatEurPdf(cents: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** Font size dinamico: rimpicciolisce per stringhe lunghe (no-wrap). */
function dynamicFontSize(text: string, base: number, thresholds: [number, number][]): number {
  for (const [maxLen, size] of thresholds) {
    if (text.length <= maxLen) return size;
  }
  return thresholds.at(-1)?.[1] ?? base;
}

// ── Componente ────────────────────────────────────────────────────────
interface Props {
  reportNumber: string;
  company: CompanySettingsValues | null;
  client: ClientDoc;
  samples: SampleDoc[];
  notes?: string;
  clientPackages?: ClientPackageDoc[];
}

export function ReportCommercialPdfDocument({ reportNumber, company, client, samples, notes, clientPackages }: Props) {

  const footerNote =
    company?.reportFooterNote ||
    (company ? `${company.legalName} · P.IVA ${company.vatNumber} · ${company.email}` : "");

  const addr = company?.address;
  const addrLine = [
    addr?.street,
    addr?.zip && addr?.city
      ? `${addr.zip} ${addr.city} (${addr.province})`
      : addr?.city,
  ]
    .filter(Boolean)
    .join(" \u2014 ");

  // Calcola totale globale
  const grandTotalCents = samples.reduce((acc, s) =>
    acc + s.items.reduce((a, item) =>
      a + (item.coveredByPackageId && !item.chargeAnyway ? 0 : item.unitPriceCents), 0), 0);

  // Totali pacchetti
  const totalUsed = clientPackages?.reduce((a, p) => a + (p.totalAnalyses - p.remainingAnalyses), 0) ?? 0;
  const totalRemaining = clientPackages?.reduce((a, p) => a + p.remainingAnalyses, 0) ?? 0;

  // Mostra colonna Metodo solo se almeno un item ha la descrizione
  const hasMethod = samples.some((s) => s.items.some((it) => it.descriptionSnapshot));
  // Senza Metodo, la sua larghezza (177) va ad Analisi: 90 + 177 = 267
  const colAnalysisWidth = hasMethod ? 90 : 267;

  return (
    <Document
      title={`Referto Commerciale ${reportNumber}`}
      author={company?.legalName ?? "Vinifera Lab"}
      subject={`Referto ${reportNumber} — ${client.displayName}`}
      creator="Vinifera CRM"
    >
      {/* ── PAGINA ANALITICA ── */}
      <Page size="A4" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <View style={S.headerTop}>
            {company?.logoUrl ? (
              <Image src={company.logoUrl} style={S.logoBox} />
            ) : (
              <View />
            )}
            <View style={{ alignItems: "flex-end" as const }}>
              <Text style={S.reportLabel}>Referto Analisi</Text>
              <Text style={S.reportNumber}>{reportNumber}</Text>
              <Text style={S.reportInternalUse}>Per uso interno</Text>
            </View>
          </View>

          <View style={S.companyInfoRow}>
            <View>
              <Text style={S.companyName}>
                {company?.displayName ?? "Laboratorio"}
              </Text>
              <Text style={S.companyMeta}>
                {[company?.vatNumber && `P.IVA ${company.vatNumber}`, addrLine]
                  .filter(Boolean)
                  .join(" | ")}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" as const }}>
              {company?.email && (
                <Text style={S.companyMeta}>{company.email}</Text>
              )}
              {company?.pec && (
                <Text style={S.companyMeta}>PEC {company.pec}</Text>
              )}
            </View>
          </View>
        </View>

        {/* ── BOX CLIENTE (SX info + DX saldo pacchetti) ── */}
        <View style={S.clientBox}>
          <View style={{ flex: 1 }}>
            <Text style={S.clientLabel}>Cliente</Text>
            <Text style={S.clientName}>{client.displayName}</Text>
            {"email" in client && client.email ? <Text style={S.clientSub}>{client.email}</Text> : null}
            {"vatNumber" in client && client.vatNumber ? <Text style={S.clientSub}>P.IVA {client.vatNumber}</Text> : null}
            {client.address && (
              <Text style={S.clientSub}>
                {[client.address.street, client.address.zip, client.address.city].filter(Boolean).join(", ")}
                {client.address.province ? ` (${client.address.province})` : ""}
              </Text>
            )}
          </View>
          {clientPackages && clientPackages.length > 0 && (
            <View style={S.pkgSummaryBox}>
              <Text style={S.pkgSummaryTitle}>Saldo pacchetti attivi</Text>
              <View style={S.pkgSummaryRow}>
                <Text style={S.pkgSummaryLabel}>N° analisi svolte:</Text>
                <Text style={S.pkgSummaryValue}>{totalUsed}</Text>
              </View>
              <View style={S.pkgSummaryRow}>
                <Text style={S.pkgSummaryLabel}>N° analisi rimaste:</Text>
                <Text style={S.pkgSummaryValue}>{totalRemaining}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Campioni */}
        {samples.map((sample) => {
          const sampleTotal = sample.items.reduce((a, item) =>
            a + (item.coveredByPackageId && !item.chargeAnyway ? 0 : item.unitPriceCents), 0);

          return (
            <View key={sample.id} style={S.sampleCard} wrap={false}>
              {/* Header campione */}
              <View style={S.sampleHeader}>
                <View>
                  <Text style={S.sampleCode}>{sample.code}</Text>
                  <Text style={S.sampleName}>{sample.sampleName}</Text>
                </View>
                <View>
                  <Text style={S.sampleMeta}>Ricevuto il {formatDatePdf(sample.receivedAt)}</Text>
                  <Text style={S.sampleMeta}>{sample.items.length} analisi</Text>
                </View>
              </View>

              {/* Tabella */}
              <View style={S.tableHeader}>
                <Text style={[S.tableHeaderText, { width: colAnalysisWidth }]}>Analisi</Text>
                <Text style={[S.tableHeaderText, S.colCode]}>Codice OIV</Text>
                <Text style={[S.tableHeaderText, S.colResult]}>Risultato</Text>
                <Text style={[S.tableHeaderText, S.colUnit]}>U.M.</Text>
                {hasMethod && <Text style={[S.tableHeaderText, S.colMethod]}>Metodo</Text>}
                <Text style={[S.tableHeaderText, S.colPrice]}>Prezzo</Text>
              </View>

              {sample.items.map((item, i) => {
                const isFree = !!item.coveredByPackageId && !item.chargeAnyway;
                const code = item.analysisCodeSnapshot ?? "";
                const method = item.descriptionSnapshot ?? "";
                const codeFontSize = dynamicFontSize(code, 8.5, [[8, 8], [14, 7], [20, 6], [999, 5.5]]);
                const methodFontSize = dynamicFontSize(method, 7.5, [[30, 7.5], [60, 6.5], [999, 6]]);

                return (
                  <View key={item.analysisId} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
                    <Text style={[S.cellText, { width: colAnalysisWidth }]}>{item.analysisNameSnapshot}</Text>
                    <Text style={[S.colCode, { fontSize: codeFontSize, fontFamily: "Courier" }]}>
                      {code}
                    </Text>
                    {item.result ? (
                      <Text style={[S.cellResult, S.colResult]}>{item.result}</Text>
                    ) : (
                      <Text style={[S.cellNoResult, S.colResult]}>—</Text>
                    )}
                    <Text style={[S.cellText, S.colUnit, { color: "#555" }]}>
                      {item.unitSnapshot ?? ""}
                    </Text>
                    {hasMethod && (
                      <Text style={[S.colMethod, { fontSize: methodFontSize, color: "#555" }]}>
                        {method}
                      </Text>
                    )}
                    {isFree ? (
                      <Text style={[S.cellPriceFree, S.colPrice]}>Da pacchetto</Text>
                    ) : (
                      <Text style={[S.cellPrice, S.colPrice]}>{formatEurPdf(item.unitPriceCents)}</Text>
                    )}
                  </View>
                );
              })}

              {/* Note campione */}
              {sample.notes && (
                <View style={S.sampleNotes}>
                  <Text style={S.sampleNotesText}>Nota: {sample.notes}</Text>
                </View>
              )}

              {/* Subtotale campione */}
              <View style={S.sampleSubtotal}>
                <Text style={S.sampleSubtotalLabel}>Subtotale campione</Text>
                <Text style={S.sampleSubtotalValue}>{formatEurPdf(sampleTotal)}</Text>
              </View>
            </View>
          );
        })}

        {/* Note referto */}
        {notes && (
          <View style={S.reportNotes}>
            <Text style={S.reportNotesLabel}>Note</Text>
            <Text style={S.reportNotesText}>{notes}</Text>
          </View>
        )}

        {/* Footer */}
        <Text
          fixed
          style={[S.footerText, { position: "absolute", bottom: 28, right: 48 }]}
          render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`}
        />
        <Text fixed style={[S.footerText, { position: "absolute", bottom: 14, left: 48, right: 48, textAlign: "center" }]}>
          {footerNote}
        </Text>
      </Page>

      {/* ── PAGINA RIEPILOGO + FIRME ── */}
      <Page size="A4" style={S.sigPage}>
        <Text style={S.sigTitle}>Riepilogo e accettazione — Referto N° {reportNumber}</Text>

        {/* Riepilogo per campione */}
        {samples.map((sample) => {
          const sampleTotal = sample.items.reduce((a, item) =>
            a + (item.coveredByPackageId && !item.chargeAnyway ? 0 : item.unitPriceCents), 0);
          return (
            <View key={sample.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottom: "0.5pt solid #eee" }}>
              <Text style={{ fontSize: 9 }}>
                {sample.code} — {sample.sampleName} ({sample.items.length} analisi)
              </Text>
              <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>{formatEurPdf(sampleTotal)}</Text>
            </View>
          );
        })}

        {/* Totale globale */}
        <View style={S.sigTotalsBox}>
          <View style={S.sigTotalsDivider} />
          <View style={S.sigTotalRow}>
            <Text style={S.sigTotalLabel}>Totale</Text>
            <Text style={S.sigTotalValue}>{formatEurPdf(grandTotalCents)}</Text>
          </View>
        </View>

        {/* Firme */}
        <View style={S.signatureRow}>
          <View style={S.signatureBlock}>
            <Text style={S.signatureLabel}>Timbro e firma laboratorio</Text>
            <View style={S.signatureLine} />
            <Text style={S.signatureSub}>{company?.legalName ?? ""}</Text>
          </View>
          <View style={S.signatureBlock}>
            <Text style={S.signatureLabel}>Firma cliente per accettazione</Text>
            <View style={S.signatureLine} />
            <Text style={S.signatureSub}>{client.displayName}</Text>
          </View>
        </View>

        {/* Footer */}
        <Text
          fixed
          style={[S.footerText, { position: "absolute", bottom: 28, right: 48 }]}
          render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`}
        />
        <Text fixed style={[S.footerText, { position: "absolute", bottom: 14, left: 48, right: 48, textAlign: "center" }]}>
          {footerNote}
        </Text>
      </Page>
    </Document>
  );
}

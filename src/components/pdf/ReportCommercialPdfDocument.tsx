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

// ── Palette colori Vinifera ───────────────────────────────────────────
const GREEN = "#1A4D3E";
const GREEN_LIGHT = "#c8e8e0";
const BG_GREEN = "#f2f8f5";
const BG_TABLE_HEADER = "#edf4f1";

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
    marginBottom: 24,
  },
  headerLeft: { flex: 1 },
  headerRight: { alignItems: "flex-end" },
  logo: { width: 120, height: 60, objectFit: "contain" },
  companyName: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  companyDetail: { fontSize: 8, color: "#555", lineHeight: 1.5 },

  // Riga titolo referto sopra il box cliente
  reportTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 8,
  },
  reportTitleText: { fontSize: 13, fontFamily: "Helvetica-Bold", color: GREEN },
  reportTitleSep: { fontSize: 13, color: "#ccc" },
  reportTitleMeta: { fontSize: 10, color: "#666" },

  // Box cliente
  clientBox: {
    padding: "10pt 14pt",
    backgroundColor: BG_GREEN,
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
  pkgSummaryValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: GREEN },

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
    backgroundColor: GREEN,
  },
  sampleCode: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#fff" },
  sampleName: { fontSize: 9, color: GREEN_LIGHT },
  sampleMeta: { fontSize: 8, color: GREEN_LIGHT, textAlign: "right" },

  // Tabella analisi con prezzi
  tableHeader: {
    flexDirection: "row",
    backgroundColor: BG_TABLE_HEADER,
    padding: "4pt 10pt",
  },
  tableHeaderText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#666", textTransform: "uppercase" },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #eee",
    padding: "5pt 10pt",
    alignItems: "flex-start",
  },
  tableRowAlt: { backgroundColor: "#fafafa" },

  colAnalysis: { width: 90 },
  colCode: { width: 70 },
  colResult: { width: 50, textAlign: "right" },
  colUnit: { width: 30, textAlign: "right" },
  colMethod: { width: 177, paddingLeft: 4 }, // 479 (row inner) - 302 (fixed cols)
  colPrice: { width: 62, textAlign: "right" },

  cellText: { fontSize: 8.5 },
  cellResult: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#1a1a1a", textAlign: "right" },
  cellNoResult: { fontSize: 8.5, color: "#aaa", fontStyle: "italic", textAlign: "right" },
  cellPrice: { fontSize: 8.5, fontFamily: "Helvetica-Bold", textAlign: "right" },
  cellPriceFree: { fontSize: 7.5, color: "#888", textAlign: "right", fontStyle: "italic" },

  // Subtotale campione
  sampleSubtotal: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: "5pt 10pt",
    backgroundColor: BG_GREEN,
    gap: 8,
  },
  sampleSubtotalLabel: { fontSize: 8, color: "#555" },
  sampleSubtotalValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: GREEN },

  // Note campione
  sampleNotes: {
    padding: "6pt 10pt",
    backgroundColor: "#fffdf0",
    borderTop: "0.5pt solid #eee",
  },
  sampleNotesText: { fontSize: 8, color: "#666" },

  // Note referto
  reportNotes: {
    marginTop: 14,
    padding: "10pt 12pt",
    backgroundColor: "#fafafa",
    borderLeft: `2pt solid ${GREEN}`,
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
    color: GREEN,
    marginBottom: 20,
    borderBottom: `1pt solid ${GREEN}`,
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
    borderTop: `1pt solid ${GREEN}`,
    marginTop: 2,
  },
  sigTotalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  sigTotalValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: GREEN, textAlign: "right" },
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
    company?.pdfFooterNote ||
    (company ? `${company.legalName} · P.IVA ${company.vatNumber} · ${company.email}` : "");

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
          <View style={S.headerLeft}>
            {company?.logoUrl ? <Image src={company.logoUrl} style={S.logo} /> : null}
          </View>
          <View style={S.headerRight}>
            <Text style={S.companyName}>{company?.displayName ?? "Laboratorio"}</Text>
            {company && (
              <>
                <Text style={[S.companyDetail, { textAlign: "right" }]}>
                  {[company.address.street, company.address.zip, company.address.city]
                    .filter(Boolean).join(" · ")}
                  {company.address.province ? ` (${company.address.province})` : ""}
                </Text>
                <Text style={[S.companyDetail, { textAlign: "right" }]}>P.IVA {company.vatNumber}</Text>
                <Text style={[S.companyDetail, { textAlign: "right" }]}>{company.email}</Text>
              </>
            )}
          </View>
        </View>

        {/* ── RIGA TITOLO REFERTO ── */}
        <View style={S.reportTitleRow}>
          <Text style={S.reportTitleText}>Referto Analisi</Text>
          <Text style={S.reportTitleSep}>—</Text>
          <Text style={S.reportTitleText}>{reportNumber}</Text>
          <Text style={S.reportTitleSep}>—</Text>
          <Text style={S.reportTitleMeta}>Per uso interno</Text>
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

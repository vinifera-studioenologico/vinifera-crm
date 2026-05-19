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
    marginBottom: 24,
  },
  headerLeft: { flex: 1 },
  headerRight: { alignItems: "flex-end" },
  logo: { width: 80, height: 40, objectFit: "contain", marginBottom: 6 },
  companyName: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  companyDetail: { fontSize: 8, color: "#555", lineHeight: 1.5 },
  reportTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: GREEN },
  reportNumber: { fontSize: 13, fontFamily: "Helvetica-Bold", color: GREEN, marginBottom: 2 },
  reportMeta: { fontSize: 8.5, color: "#666" },

  // Box cliente
  clientBox: {
    padding: "10pt 14pt",
    backgroundColor: BG_GREEN,
    borderRadius: 4,
    marginBottom: 20,
  },
  clientLabel: { fontSize: 7, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  clientName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  clientSub: { fontSize: 8.5, color: "#555", marginTop: 1 },

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
  tableHeaderText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#666", textTransform: "uppercase" },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #eee",
    padding: "5pt 10pt",
    alignItems: "flex-start",
  },
  tableRowAlt: { backgroundColor: "#fafafa" },

  colCode: { width: 50 },
  colAnalysis: { flex: 1 },
  colPrice: { width: 80, textAlign: "right" },

  cellMono: { fontSize: 8.5, fontFamily: "Courier" },
  cellText: { fontSize: 9 },
  cellPrice: { fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "right" },
  cellPriceFree: { fontSize: 8, color: "#888", textAlign: "right", fontStyle: "italic" },

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

  // Sezione totali globali
  totalsSection: { alignItems: "flex-end", marginTop: 8, marginBottom: 16 },
  totalsBox: { width: 220 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalsLabel: { fontSize: 8.5, color: "#555" },
  totalsValue: { fontSize: 8.5, textAlign: "right" },
  totalsDivider: { borderBottom: "0.5pt solid #ccc", marginVertical: 4 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderTop: `1pt solid ${GREEN}`,
    marginTop: 2,
  },
  totalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  totalValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: GREEN, textAlign: "right" },

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
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    borderTop: "0.5pt solid #ddd",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
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

// ── Componente ────────────────────────────────────────────────────────
interface Props {
  reportNumber: string;
  company: CompanySettingsValues | null;
  client: ClientDoc;
  samples: SampleDoc[];
  notes?: string;
}

export function ReportCommercialPdfDocument({ reportNumber, company, client, samples, notes }: Props) {
  const today = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });

  const footerNote =
    company?.pdfFooterNote ||
    (company ? `${company.legalName} · P.IVA ${company.vatNumber} · ${company.email}` : "");

  // Calcola totale globale
  const grandTotalCents = samples.reduce((acc, s) =>
    acc + s.items.reduce((a, item) =>
      a + (item.coveredByPackageId && !item.chargeAnyway ? 0 : item.unitPriceCents), 0), 0);

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
            <Text style={S.companyName}>{company?.displayName ?? "Laboratorio"}</Text>
            {company && (
              <>
                <Text style={S.companyDetail}>
                  {[company.address.street, company.address.zip, company.address.city]
                    .filter(Boolean).join(" · ")}
                  {company.address.province ? ` (${company.address.province})` : ""}
                </Text>
                <Text style={S.companyDetail}>P.IVA {company.vatNumber}</Text>
                <Text style={S.companyDetail}>{company.email}</Text>
              </>
            )}
          </View>
          <View style={S.headerRight}>
            <Text style={S.reportTitle}>REFERTO</Text>
            <Text style={S.reportNumber}>N° {reportNumber}</Text>
            <Text style={S.reportMeta}>Emesso il {today}</Text>
            <Text style={S.reportMeta}>{samples.length} campion{samples.length === 1 ? "e" : "i"}</Text>
          </View>
        </View>

        {/* Box cliente */}
        <View style={S.clientBox}>
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
                <Text style={[S.tableHeaderText, S.colCode]}>Codice</Text>
                <Text style={[S.tableHeaderText, S.colAnalysis]}>Analisi</Text>
                <Text style={[S.tableHeaderText, S.colPrice]}>Prezzo</Text>
              </View>

              {sample.items.map((item, i) => {
                const isFree = !!item.coveredByPackageId && !item.chargeAnyway;
                return (
                  <View key={item.analysisId} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
                    <Text style={[S.cellMono, S.colCode]}>{item.analysisCodeSnapshot}</Text>
                    <Text style={[S.cellText, S.colAnalysis]}>{item.analysisNameSnapshot}</Text>
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
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{footerNote}</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
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
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{footerNote}</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

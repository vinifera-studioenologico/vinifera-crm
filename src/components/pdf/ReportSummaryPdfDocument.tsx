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
import type { ReportDoc } from "@/schemas/report";

Font.registerHyphenationCallback((word) => [word]);

// ── Palette B/W (coerente con ReportCommercialPdfDocument) ─────────────
const ACCENT = "#111827";
const BG_CLIENT = "#F3F4F6";
const BG_TABLE_HEADER = "#F3F4F6";

const DEFAULT_LEGAL_NOTE =
  "Il presente referto riepilogativo raggruppa i referti analitici indicati, già emessi singolarmente ed eventualmente già consegnati al cliente. Il laboratorio declina ogni responsabilità per le informazioni fornite dal cliente relative ai singoli campioni. Il presente documento non può essere riprodotto parzialmente senza autorizzazione scritta del laboratorio.";

// ── Stili ─────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#111",
    padding: "40pt 48pt",
    lineHeight: 1.4,
  },

  header: { marginBottom: 24 },
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
  companyName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: ACCENT, marginBottom: 2 },
  companyMeta: { fontSize: 9, color: "#6B7280", lineHeight: 1.4 },
  reportLabel: { fontSize: 9, color: "#6B7280", textTransform: "uppercase", letterSpacing: 1 },
  reportNumber: { fontSize: 16, fontFamily: "Helvetica-Bold", color: ACCENT, marginTop: 2 },
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

  clientBox: {
    padding: "10pt 14pt",
    backgroundColor: BG_CLIENT,
    borderRadius: 4,
    marginBottom: 20,
  },
  clientLabel: { fontSize: 7, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  clientName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  clientSub: { fontSize: 8.5, color: "#555", marginTop: 1 },

  // Sezione referto (raggruppa i campioni di un referto incluso)
  reportGroup: { marginBottom: 22 },
  reportGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6pt 10pt",
    backgroundColor: ACCENT,
    borderRadius: 3,
    marginBottom: 8,
  },
  reportGroupTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#fff" },
  reportGroupMeta: { fontSize: 8, color: "#D1D5DB" },

  // Campione card (identica a ReportCommercialPdfDocument)
  sampleCard: { marginBottom: 12, borderRadius: 4, border: "0.5pt solid #ddd", overflow: "hidden" },
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

  tableHeader: { flexDirection: "row", backgroundColor: BG_TABLE_HEADER, padding: "4pt 10pt" },
  tableHeaderText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#666", textTransform: "uppercase", textAlign: "center" },
  tableRow: { flexDirection: "row", borderBottom: "0.5pt solid #eee", padding: "5pt 10pt", alignItems: "center" },
  tableRowAlt: { backgroundColor: "#fafafa" },

  colAnalysis: { width: 337 },
  colResult: { width: 50, textAlign: "center" },
  colUnit: { width: 30, textAlign: "center" },
  colPrice: { width: 62, textAlign: "center" },

  cellText: { fontSize: 8.5 },
  cellResult: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#1a1a1a", textAlign: "center" },
  cellNoResult: { fontSize: 8.5, color: "#aaa", fontStyle: "italic", textAlign: "center" },
  cellPrice: { fontSize: 8.5, fontFamily: "Helvetica-Bold", textAlign: "center" },
  cellPriceFree: { fontSize: 7.5, color: "#888", textAlign: "center", fontStyle: "italic" },
  paramName: { fontSize: 8.5 },
  paramMethod: { fontSize: 7, fontStyle: "italic", color: "#888", marginTop: 1 },

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

  // Subtotale referto (fine di ogni gruppo)
  reportSubtotal: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: "6pt 10pt",
    gap: 8,
    borderTop: `1pt solid ${ACCENT}`,
    marginTop: 2,
  },
  reportSubtotalLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#555" },
  reportSubtotalValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: ACCENT },

  reportNotes: {
    marginTop: 14,
    padding: "10pt 12pt",
    backgroundColor: "#F9FAFB",
    borderLeft: "2pt solid #D1D5DB",
    borderRadius: 2,
  },
  reportNotesLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#888", textTransform: "uppercase", marginBottom: 4 },
  reportNotesText: { fontSize: 8.5, color: "#444", lineHeight: 1.5 },

  legalNote: { marginTop: 14, fontSize: 6.5, color: "#999", lineHeight: 1.4 },
  footerText: { fontSize: 7, color: "#999" },

  // ── Pagina riepilogo + firme ──────────────────────────────────────
  sigPage: { fontFamily: "Helvetica", fontSize: 9, color: "#111", padding: "40pt 48pt", lineHeight: 1.4 },
  sigTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: ACCENT,
    marginBottom: 20,
    borderBottom: `1pt solid ${ACCENT}`,
    paddingBottom: 6,
  },
  sigReportRow: { marginBottom: 8 },
  sigReportHeaderRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  sigReportLabel: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  sigReportValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: ACCENT },
  sigSampleRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, paddingLeft: 10 },
  sigSampleText: { fontSize: 8, color: "#555" },
  sigSampleValue: { fontSize: 8, color: "#555" },
  sigTotalsBox: { width: 260, alignSelf: "flex-end", marginTop: 20 },
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
  signatureRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 50 },
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

function dynamicFontSize(text: string, base: number, thresholds: [number, number][]): number {
  for (const [maxLen, size] of thresholds) {
    if (text.length <= maxLen) return size;
  }
  return thresholds.at(-1)?.[1] ?? base;
}

function sampleTotalCents(sample: SampleDoc): number {
  return sample.items.reduce(
    (a, item) => a + (item.coveredByPackageId && !item.chargeAnyway ? 0 : item.unitPriceCents),
    0,
  );
}

function reportTotalCents(samples: SampleDoc[]): number {
  return samples.reduce((a, s) => a + sampleTotalCents(s), 0);
}

// ── Componente ────────────────────────────────────────────────────────
export interface ReportSummaryGroup {
  report: ReportDoc;
  samples: SampleDoc[];
}

interface Props {
  summaryNumber: string;
  company: CompanySettingsValues | null;
  client: ClientDoc;
  groups: ReportSummaryGroup[];
  notes?: string;
}

/**
 * Referto riepilogativo — raggruppa più referti già emessi (che a loro
 * volta contengono i campioni) per lo stesso cliente, con subtotale per
 * referto e totale complessivo finale. Struttura ricalcata da
 * ReportCommercialPdfDocument, un livello sopra (referti invece di campioni).
 */
export function ReportSummaryPdfDocument({ summaryNumber, company, client, groups, notes }: Props) {
  const footerNote =
    company?.reportFooterNote ||
    (company ? `${company.legalName} · P.IVA ${company.vatNumber} · ${company.email}` : "");

  const addr = company?.address;
  const addrLine = [
    addr?.street,
    addr?.zip && addr?.city ? `${addr.zip} ${addr.city} (${addr.province})` : addr?.city,
  ]
    .filter(Boolean)
    .join(" — ");

  const grandTotalCents = groups.reduce((acc, g) => acc + reportTotalCents(g.samples), 0);
  const legalNote = company?.reportLegalNote || DEFAULT_LEGAL_NOTE;

  return (
    <Document
      title={`Referto Riepilogativo ${summaryNumber}`}
      author={company?.legalName ?? "Vinifera Lab"}
      subject={`Referto riepilogativo ${summaryNumber} — ${client.displayName}`}
      creator="Vinifera CRM"
    >
      {/* ── PAGINA ANALITICA ── */}
      <Page size="A4" style={S.page}>
        <View style={S.header}>
          <View style={S.headerTop}>
            {company?.logoUrl ? <Image src={company.logoUrl} style={S.logoBox} /> : <View />}
            <View style={{ alignItems: "flex-end" as const }}>
              <Text style={S.reportLabel}>Referto Riepilogativo</Text>
              <Text style={S.reportNumber}>{summaryNumber}</Text>
              <Text style={S.reportInternalUse}>Per uso interno</Text>
            </View>
          </View>

          <View style={S.companyInfoRow}>
            <View>
              <Text style={S.companyName}>{company?.displayName ?? "Laboratorio"}</Text>
              <Text style={S.companyMeta}>
                {[company?.vatNumber && `P.IVA ${company.vatNumber}`, addrLine].filter(Boolean).join(" | ")}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" as const }}>
              {company?.email && <Text style={S.companyMeta}>{company.email}</Text>}
              {company?.pec && <Text style={S.companyMeta}>PEC {company.pec}</Text>}
            </View>
          </View>
        </View>

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
          <Text style={[S.clientSub, { marginTop: 6 }]}>
            Riepilogo di {groups.length} referti · {groups.reduce((a, g) => a + g.samples.length, 0)} campioni totali
          </Text>
        </View>

        {/* Referti + relativi campioni */}
        {groups.map(({ report, samples }) => (
          <View key={report.id} style={S.reportGroup} wrap={false}>
            <View style={S.reportGroupHeader}>
              <Text style={S.reportGroupTitle}>Referto {report.number}</Text>
              <Text style={S.reportGroupMeta}>
                {formatDatePdf(report.generatedAt)} · {samples.length} campion{samples.length === 1 ? "e" : "i"}
              </Text>
            </View>

            {samples.map((sample) => (
              <View key={sample.id} style={S.sampleCard} wrap={false}>
                <View style={S.sampleHeader}>
                  <View>
                    <Text style={S.sampleCode}>{sample.code}</Text>
                    <Text style={S.sampleName}>{sample.sampleName}</Text>
                  </View>
                  <View>
                    <Text style={S.sampleMeta}>{sample.items.length} analisi</Text>
                  </View>
                </View>

                <View style={S.tableHeader}>
                  <Text style={[S.tableHeaderText, S.colAnalysis, { textAlign: "left" }]}>Analisi / Metodo</Text>
                  <Text style={[S.tableHeaderText, S.colResult]}>Risultato</Text>
                  <Text style={[S.tableHeaderText, S.colUnit]}>U.M.</Text>
                  <Text style={[S.tableHeaderText, S.colPrice]}>Prezzo</Text>
                </View>

                {sample.items.map((item, i) => {
                  const isFree = !!item.coveredByPackageId && !item.chargeAnyway;
                  const code = item.analysisCodeSnapshot ?? "";
                  const description = item.descriptionSnapshot ?? "";
                  const methodLine = [code, description].filter(Boolean).join(" · ");
                  const methodFontSize = dynamicFontSize(methodLine, 7, [[40, 7], [70, 6.5], [999, 6]]);

                  return (
                    <View key={item.analysisId} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
                      <View style={S.colAnalysis}>
                        <Text style={S.paramName}>{item.analysisNameSnapshot}</Text>
                        {methodLine && <Text style={[S.paramMethod, { fontSize: methodFontSize }]}>{methodLine}</Text>}
                      </View>
                      {item.result ? (
                        <Text style={[S.cellResult, S.colResult]}>{item.result}</Text>
                      ) : (
                        <Text style={[S.cellNoResult, S.colResult]}>—</Text>
                      )}
                      <Text style={[S.cellText, S.colUnit, { color: "#555" }]}>{item.unitSnapshot ?? ""}</Text>
                      {isFree ? (
                        <Text style={[S.cellPriceFree, S.colPrice]}>Da pacchetto</Text>
                      ) : (
                        <Text style={[S.cellPrice, S.colPrice]}>{formatEurPdf(item.unitPriceCents)}</Text>
                      )}
                    </View>
                  );
                })}

                <View style={S.sampleSubtotal}>
                  <Text style={S.sampleSubtotalLabel}>Subtotale campione</Text>
                  <Text style={S.sampleSubtotalValue}>{formatEurPdf(sampleTotalCents(sample))}</Text>
                </View>
              </View>
            ))}

            <View style={S.reportSubtotal}>
              <Text style={S.reportSubtotalLabel}>Subtotale referto {report.number}</Text>
              <Text style={S.reportSubtotalValue}>{formatEurPdf(reportTotalCents(samples))}</Text>
            </View>
          </View>
        ))}

        {notes && (
          <View style={S.reportNotes}>
            <Text style={S.reportNotesLabel}>Note</Text>
            <Text style={S.reportNotesText}>{notes}</Text>
          </View>
        )}

        <Text style={S.legalNote}>{legalNote}</Text>

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
        <Text style={S.sigTitle}>Riepilogo e accettazione — Referto Riepilogativo N° {summaryNumber}</Text>

        {groups.map(({ report, samples }) => (
          <View key={report.id} style={S.sigReportRow} wrap={false}>
            <View style={S.sigReportHeaderRow}>
              <Text style={S.sigReportLabel}>Referto {report.number}</Text>
              <Text style={S.sigReportValue}>{formatEurPdf(reportTotalCents(samples))}</Text>
            </View>
            {samples.map((sample) => (
              <View key={sample.id} style={S.sigSampleRow}>
                <Text style={S.sigSampleText}>
                  {sample.code} — {sample.sampleName} ({sample.items.length} analisi)
                </Text>
                <Text style={S.sigSampleValue}>{formatEurPdf(sampleTotalCents(sample))}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={S.sigTotalsBox}>
          <View style={S.sigTotalsDivider} />
          <View style={S.sigTotalRow}>
            <Text style={S.sigTotalLabel}>Totale complessivo</Text>
            <Text style={S.sigTotalValue}>{formatEurPdf(grandTotalCents)}</Text>
          </View>
        </View>

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

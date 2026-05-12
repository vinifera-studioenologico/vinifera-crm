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

// ── Stili ─────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#111",
    padding: "40pt 48pt",
    lineHeight: 1.4,
  },
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
  reportTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#5B1A1A" },
  reportNumber: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#5B1A1A", marginBottom: 2 },
  reportMeta: { fontSize: 8.5, color: "#666" },

  // Info cliente
  clientBox: {
    padding: "10pt 14pt",
    backgroundColor: "#f8f4f4",
    borderRadius: 4,
    marginBottom: 20,
  },
  clientLabel: { fontSize: 7, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  clientName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  clientSub: { fontSize: 8.5, color: "#555", marginTop: 1 },

  // Campione
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
    backgroundColor: "#5B1A1A",
  },
  sampleCode: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#fff" },
  sampleName: { fontSize: 9, color: "#fde8e8" },
  sampleMeta: { fontSize: 8, color: "#fde8e8", textAlign: "right" },

  // Tabella analisi
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f0f0",
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
  colResult: { width: 120, textAlign: "right" },
  colUnit: { width: 50, textAlign: "right" },

  cellMono: { fontSize: 8.5, fontFamily: "Courier" },
  cellText: { fontSize: 9 },
  cellResult: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1a1a1a" },
  cellNoResult: { fontSize: 9, color: "#aaa", fontStyle: "italic" },

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
    borderLeft: "2pt solid #5B1A1A",
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
});

// ── Helpers ───────────────────────────────────────────────────────────
function formatDatePdf(ts: unknown): string {
  if (!ts) return "—";
  const d =
    typeof ts === "object" && ts !== null && "toDate" in ts
      ? (ts as { toDate: () => Date }).toDate()
      : new Date(ts as string);
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ── Componente PDF ────────────────────────────────────────────────────
interface Props {
  reportNumber: string;
  company: CompanySettingsValues | null;
  client: ClientDoc;
  samples: SampleDoc[];
  notes?: string;
}

export function ReportPdfDocument({
  reportNumber,
  company,
  client,
  samples,
  notes,
}: Props) {
  const today = new Date().toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const footerNote =
    company?.pdfFooterNote ??
    (company ? `${company.legalName} · P.IVA ${company.vatNumber} · ${company.email}` : "");

  return (
    <Document
      title={`Referto ${reportNumber}`}
      author={company?.legalName ?? "Vinifera Lab"}
      subject={`Referto ${reportNumber} — ${client.displayName}`}
      creator="Vinifera CRM"
    >
      <Page size="A4" style={S.page}>
        {/* ── HEADER ── */}
        <View style={S.header}>
          <View style={S.headerLeft}>
            {company?.logoUrl ? <Image src={company.logoUrl} style={S.logo} /> : null}
            <Text style={S.companyName}>{company?.displayName ?? "Laboratorio"}</Text>
            {company && (
              <>
                <Text style={S.companyDetail}>
                  {company.address.street} · {company.address.zip}{" "}
                  {company.address.city}
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
            <Text style={S.reportMeta}>
              {samples.length} campion{samples.length === 1 ? "e" : "i"}
            </Text>
          </View>
        </View>

        {/* ── INFO CLIENTE ── */}
        <View style={S.clientBox}>
          <Text style={S.clientLabel}>Cliente</Text>
          <Text style={S.clientName}>{client.displayName}</Text>
          {"email" in client && client.email ? (
            <Text style={S.clientSub}>{client.email}</Text>
          ) : null}
          {"vatNumber" in client && client.vatNumber ? (
            <Text style={S.clientSub}>P.IVA {client.vatNumber}</Text>
          ) : null}
          {client.address && (
            <Text style={S.clientSub}>
              {client.address.street}, {client.address.zip} {client.address.city}
              {client.address.province ? ` (${client.address.province})` : ""}
            </Text>
          )}
        </View>

        {/* ── CAMPIONI ── */}
        {samples.map((sample) => (
          <View key={sample.id} style={S.sampleCard} wrap={false}>
            {/* Header campione */}
            <View style={S.sampleHeader}>
              <View>
                <Text style={S.sampleCode}>{sample.code}</Text>
                <Text style={S.sampleName}>{sample.sampleName}</Text>
              </View>
              <View>
                <Text style={S.sampleMeta}>
                  Ricevuto il {formatDatePdf(sample.receivedAt)}
                </Text>
                <Text style={S.sampleMeta}>
                  {sample.items.length} analisi
                </Text>
              </View>
            </View>

            {/* Tabella analisi */}
            <View style={S.tableHeader}>
              <Text style={[S.tableHeaderText, S.colCode]}>Codice</Text>
              <Text style={[S.tableHeaderText, S.colAnalysis]}>Analisi</Text>
              <Text style={[S.tableHeaderText, S.colResult]}>Risultato</Text>
            </View>

            {sample.items.map((item, i) => (
              <View
                key={item.analysisId}
                style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}
              >
                <Text style={[S.cellMono, S.colCode]}>
                  {item.analysisCodeSnapshot}
                </Text>
                <Text style={[S.cellText, S.colAnalysis]}>
                  {item.analysisNameSnapshot}
                </Text>
                {item.result ? (
                  <Text style={[S.cellResult, S.colResult]}>{item.result}</Text>
                ) : (
                  <Text style={[S.cellNoResult, S.colResult]}>—</Text>
                )}
              </View>
            ))}

            {/* Note campione */}
            {sample.notes && (
              <View style={S.sampleNotes}>
                <Text style={S.sampleNotesText}>Nota: {sample.notes}</Text>
              </View>
            )}
          </View>
        ))}

        {/* ── NOTE REFERTO ── */}
        {notes && (
          <View style={S.reportNotes}>
            <Text style={S.reportNotesLabel}>Note</Text>
            <Text style={S.reportNotesText}>{notes}</Text>
          </View>
        )}

        {/* ── FOOTER ── */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{footerNote}</Text>
          <Text
            style={S.footerText}
            render={({ pageNumber, totalPages }) =>
              `Pag. ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

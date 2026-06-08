/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image does not support alt prop */
import {
  Document,
  Page,
  Text,
  View,
  Font,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { QuoteDoc } from "@/schemas/quote";
import type { CompanySettingsValues } from "@/schemas/client";

Font.registerHyphenationCallback((word) => [word]);

// ── Testi di fallback ─────────────────────────────────────────────────
const DEFAULT_FISCAL_NOTE = [
  "Operazione senza applicazione dell\u2019IVA ai sensi dell\u2019art. 1, commi 54-89, L. 190/2014 \u2014 regime forfettario.",
  "Compenso soggetto a contributo previdenziale ENPAIA/Cassa agrotecnici nella misura indicata, da applicare sull\u2019imponibile. Il contributo \u00e8 a carico del committente ai sensi dell\u2019art. 1, c. 212, L. 662/1996.",
  "Il compenso non \u00e8 soggetto a ritenuta d\u2019acconto ai sensi dell\u2019art. 1, comma 67, L. 190/2014.",
  "L\u2019eventuale imposta di bollo su fattura elettronica (\u20ac 2,00) \u00e8 dovuta nei casi previsti dalla normativa vigente.",
].join("\n");

const DEFAULT_CONDITIONS = [
  "1. VALIDIT\u00c0 DEL PREVENTIVO\nIl presente preventivo ha validit\u00e0 30 giorni dalla data di emissione, salvo espressa proroga concordata per iscritto. Decorso tale termine, il professionista si riserva di aggiornare le condizioni economiche senza preavviso.",
  "2. AVVIO DELLE ATTIVIT\u00c0\nLe attivit\u00e0 avranno inizio previo ricevimento della presente accettazione firmata e, ove concordato, del relativo acconto. L\u2019avvio non \u00e8 subordinato a termini automatici ed \u00e8 condizionato alla ricezione di tutta la documentazione, dei campioni e delle informazioni necessarie all\u2019esecuzione dell\u2019incarico.",
  "3. ESCLUSIONI E ATTIVIT\u00c0 EXTRA\nSono escluse dal presente preventivo tutte le attivit\u00e0 non esplicitamente descritte. Qualsiasi prestazione aggiuntiva, variazione di scope o analisi supplementare non inclusa nell\u2019offerta dovr\u00e0 essere preventivamente concordata per iscritto e sar\u00e0 oggetto di separata quotazione.",
  "4. COSTI AGGIUNTIVI\nEventuali spese per trasferte, sopralluoghi in cantina, campionamenti, materiali di consumo specifici, spedizioni di campioni, analisi straordinarie o interventi urgenti non inclusi nell\u2019offerta saranno fatturati separatamente previo accordo tra le parti, sulla base dei costi effettivamente sostenuti.",
  "5. TEMPISTICHE\nLe tempistiche indicate sono da intendersi come puramente indicative in condizioni operative ordinarie. Il professionista non si assume responsabilit\u00e0 per ritardi imputabili al mancato o tardivo conferimento di campioni, dati analitici, documentazione tecnica o informazioni da parte del committente. In tali casi le scadenze potranno slittare proporzionalmente senza che ci\u00f2 costituisca inadempimento contrattuale.",
  "6. REGIME FISCALE E PREVIDENZIALE\nOperazione senza applicazione dell\u2019IVA ai sensi dell\u2019art. 1, commi 54-89, L. 190/2014 \u2014 regime forfettario. Il compenso non \u00e8 soggetto a ritenuta d\u2019acconto ai sensi dell\u2019art. 1, comma 67, L. 190/2014. Al compenso imponibile \u00e8 applicato il contributo previdenziale ENPAIA/Cassa agrotecnici al 4%, a carico del committente ai sensi dell\u2019art. 1, c. 212, L. 662/1996. L\u2019eventuale imposta di bollo su fattura elettronica (\u20ac 2,00) \u00e8 dovuta nei casi previsti dalla normativa vigente.",
  "7. RISERVATEZZA E TRATTAMENTO DEI DATI PERSONALI (GDPR)\nI dati personali del committente saranno trattati ai sensi del Regolamento UE 2016/679 (GDPR) e della normativa nazionale vigente, esclusivamente per le finalit\u00e0 connesse all\u2019esecuzione del presente incarico professionale e agli obblighi fiscali e previdenziali conseguenti. I dati non saranno comunicati a terzi, salvo i casi previsti dalla legge. Il committente ha diritto di accesso, rettifica, cancellazione e opposizione al trattamento, rivolgendosi al titolare del trattamento.",
].join("\n\n");

const DEFAULT_PRIVACY_NOTE =
  "Qualora l\u2019esecuzione del servizio comporti il trattamento di dati personali per conto del cliente, le parti si impegnano a regolare separatamente i rispettivi ruoli privacy ai sensi del Regolamento UE 2016/679, anche mediante eventuale nomina a Responsabile del trattamento ove necessaria.";

const DEFAULT_ACCEPTANCE_TEXT =
  "Il committente, con la firma del presente documento, dichiara di accettare integralmente le condizioni economiche e contrattuali del presente preventivo, nonch\u00e9 di approvare specificamente, ai sensi degli artt. 1341 e 1342 c.c., le seguenti clausole: art. 3 (esclusioni e attivit\u00e0 extra), art. 4 (costi aggiuntivi), art. 5 (tempistiche e ritardi), art. 6 (regime fiscale e previdenziale).";

// ── Helpers ───────────────────────────────────────────────────────────

function eur(cents: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function fmtDate(ts: unknown): string {
  if (!ts) return "\u2014";
  const d =
    typeof ts === "object" && ts !== null && "toDate" in ts
      ? (ts as { toDate: () => Date }).toDate()
      : new Date(ts as string);
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtPaymentTerms(
  pt: NonNullable<QuoteDoc["paymentTerms"]>,
): string {
  if (pt.installmentsCount === 1) return "Unica soluzione";
  const period = pt.installmentPeriod ?? "monthly";
  let cadence = "";
  if (period === "monthly") cadence = "mensili";
  else if (period === "biweekly") cadence = "bisettimanali";
  else if (
    period === "custom" &&
    pt.customInterval &&
    pt.customUnit
  ) {
    const unit =
      pt.customUnit === "days"
        ? "giorni"
        : pt.customUnit === "years"
          ? "anni"
          : "mesi";
    cadence = `ogni ${pt.customInterval} ${unit}`;
  }
  return `${pt.installmentsCount} rate ${cadence}`.trim();
}

/** Calcola tutte le date delle rate partendo da firstDueDate */
function calcInstallmentDates(
  pt: NonNullable<QuoteDoc["paymentTerms"]>,
): Date[] {
  if (!pt.firstDueDate || pt.installmentsCount <= 0) return [];
  const dates: Date[] = [];
  // Parse as local time to avoid UTC-midnight offset shifting the date by one day
  const [fy, fm, fd] = pt.firstDueDate.split("-").map(Number);
  const first = new Date(fy!, fm! - 1, fd!);
  const period = pt.installmentPeriod ?? "monthly";
  for (let i = 0; i < pt.installmentsCount; i++) {
    if (i === 0) {
      dates.push(new Date(first));
    } else {
      const prev = new Date(dates[i - 1]!);
      if (period === "monthly") {
        prev.setMonth(prev.getMonth() + 1);
      } else if (period === "biweekly") {
        prev.setDate(prev.getDate() + 14);
      } else if (
        period === "custom" &&
        pt.customInterval &&
        pt.customUnit
      ) {
        if (pt.customUnit === "days")
          prev.setDate(prev.getDate() + pt.customInterval);
        else if (pt.customUnit === "months")
          prev.setMonth(prev.getMonth() + pt.customInterval);
        else if (pt.customUnit === "years")
          prev.setFullYear(prev.getFullYear() + pt.customInterval);
      }
      dates.push(new Date(prev));
    }
  }
  return dates;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Bozza",
  pending_approval: "In attesa approvazione",
  approved: "Approvato",
  rejected: "Rifiutato",
  cancelled: "Annullato",
};

// ── Font size scaling ─────────────────────────────────────────────────
const FONT_SCALE: Record<string, number> = {
  sm: 0.85,
  md: 1,
  lg: 1.15,
  xl: 1.3,
};

// ── Stili (B/W — solo logo a colori) ──────────────────────────────────

const ACCENT = "#111827";

/** Stili statici per la filigrana (non dipendono dalla scala font) */
const WM = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    fontSize: 100,
    fontFamily: "Helvetica-Bold",
    color: "#E5E7EB",
    opacity: 0.4,
    transform: "rotate(-45deg)",
  },
});

function makeStyles(scale: number) {
  const f = (n: number) => Math.round(n * scale * 10) / 10;
  return StyleSheet.create({
    page: {
      paddingTop: 48,
      paddingBottom: 60,
      paddingHorizontal: 40,
      fontSize: f(10.5),
      fontFamily: "Helvetica",
      color: "#111827",
    },
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
      fontSize: f(14),
      fontFamily: "Helvetica-Bold",
      color: ACCENT,
      marginBottom: 2,
    },
    companyMeta: { fontSize: f(9), color: "#6B7280", lineHeight: 1.4 },
    quoteLabel: {
      fontSize: f(9),
      color: "#6B7280",
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    quoteNumber: {
      fontSize: f(16),
      fontFamily: "Helvetica-Bold",
      color: ACCENT,
      marginTop: 2,
    },
    quoteDate: { fontSize: f(9.5), color: "#6B7280", marginTop: 4 },
    sectionTitle: {
      fontSize: f(9.5),
      fontFamily: "Helvetica-Bold",
      color: ACCENT,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 6,
      marginTop: 18,
      paddingBottom: 3,
      borderBottomWidth: 1,
      borderBottomColor: "#E5E7EB",
    },
    clientName: {
      fontFamily: "Helvetica-Bold",
      fontSize: f(11.5),
      marginBottom: 2,
    },
    clientMeta: { color: "#6B7280", fontSize: f(9.5), lineHeight: 1.5 },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: ACCENT,
      paddingVertical: 5,
      paddingHorizontal: 6,
      borderRadius: 2,
      marginTop: 4,
    },
    tableHeaderText: {
      fontFamily: "Helvetica-Bold",
      fontSize: f(9),
      color: "#ffffff",
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 6,
      paddingHorizontal: 6,
      borderBottomWidth: 0.5,
      borderBottomColor: "#F3F4F6",
    },
    tableRowAlt: { backgroundColor: "#F9FAFB" },
    tableCell: { fontSize: f(10) },
    colN: { width: "5%" },
    colDesc: { width: "47%" },
    colQty: { width: "8%", textAlign: "right" },
    colPrice: { width: "18%", textAlign: "right" },
    colTotal: { width: "22%", textAlign: "right" },
    totalsBlock: { alignItems: "flex-end", marginTop: 14 },
    totalsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      minWidth: 240,
      paddingVertical: 3,
    },
    totalsLabel: { fontSize: f(10), color: "#6B7280", paddingRight: 16 },
    totalsValue: { fontSize: f(10) },
    totalsDiscountValue: { fontSize: f(10), color: "#991B1B" },
    totalsDivider: {
      width: 240,
      borderBottomWidth: 0.5,
      borderBottomColor: "#D1D5DB",
      marginVertical: 4,
    },
    grandTotalLabel: { fontSize: f(13), fontFamily: "Helvetica-Bold" },
    grandTotalValue: {
      fontSize: f(13),
      fontFamily: "Helvetica-Bold",
      color: ACCENT,
    },
    notesText: {
      fontSize: f(10),
      fontFamily: "Helvetica-Oblique",
      color: "#374151",
      lineHeight: 1.5,
      textAlign: "justify",
    },
    paymentLine: {
      fontSize: f(10),
      color: "#374151",
      lineHeight: 1.6,
      marginBottom: 4,
      textAlign: "justify",
    },
    fiscalNote: {
      marginTop: 10,
      marginBottom: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      backgroundColor: "#F9FAFB",
      borderRadius: 2,
      borderLeftWidth: 2,
      borderLeftColor: "#D1D5DB",
    },
    fiscalNoteText: {
      fontSize: f(8.5),
      color: "#6B7280",
      fontFamily: "Helvetica-Oblique",
      lineHeight: 1.5,
      textAlign: "justify",
    },
    conditionText: {
      fontSize: f(9.5),
      color: "#374151",
      lineHeight: 1.65,
      marginBottom: 10,
      textAlign: "justify",
    },
    specificApprovalText: {
      fontSize: f(9),
      color: "#374151",
      lineHeight: 1.6,
      textAlign: "justify",
    },
    sigBlock: { marginTop: 32 },
    sigLine: {
      borderBottomWidth: 0.5,
      borderBottomColor: "#374151",
      marginTop: 40,
      marginBottom: 4,
    },
    sigLabel: { fontSize: f(9), color: "#6B7280" },
    sigRow: { flexDirection: "row", gap: 24, marginTop: 24 },
    footer: {
      position: "absolute",
      bottom: 20,
      left: 40,
      right: 40,
      borderTopWidth: 0.5,
      borderTopColor: "#E5E7EB",
      paddingTop: 5,
      flexDirection: "row",
      justifyContent: "space-between",
    },
    footerText: { fontSize: f(7.5), color: "#9CA3AF" },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      fontSize: f(9),
      fontFamily: "Helvetica-Bold",
      alignSelf: "flex-end",
      marginTop: 4,
    },
    // ── Stili inline promossi per scalare tutti i fontSize ────────────
    itemKindText: { fontSize: f(8.5), color: "#6B7280", marginTop: 1 },
    conditionArticleTitle: {
      fontSize: f(9.5),
      fontFamily: "Helvetica-Bold",
      color: ACCENT,
      marginBottom: 2,
      textTransform: "uppercase",
    },
    conditionsPageSectionTitle: {
      fontSize: f(11),
      fontFamily: "Helvetica-Bold",
      color: ACCENT,
      marginTop: 0,
      marginBottom: 6,
    },
    acceptanceBoxTitle: {
      fontSize: f(11),
      fontFamily: "Helvetica-Bold",
      color: ACCENT,
      marginBottom: 6,
    },
    acceptanceBoxBody: {
      fontSize: f(9),
      color: "#374151",
      lineHeight: 1.5,
      marginBottom: 8,
    },
  });
}

type PdfStyles = ReturnType<typeof makeStyles>;

// ── Sub-components ────────────────────────────────────────────────────

function PdfHeader({
  quote,
  company,
  s,
}: {
  quote: QuoteDoc;
  company: CompanySettingsValues | null;
  s: PdfStyles;
}) {
  const S = s;
  const addr = company?.address;
  const addrLine = [
    addr?.street,
    addr?.zip && addr?.city
      ? `${addr.zip} ${addr.city} (${addr.province})`
      : addr?.city,
  ]
    .filter(Boolean)
    .join(" \u2014 ");

  return (
    <View style={S.header}>
      <View style={S.headerTop}>
        {company?.logoUrl ? (
          <Image src={company.logoUrl} style={S.logoBox} />
        ) : (
          <View />
        )}
        <View style={{ alignItems: "flex-end" as const }}>
          <Text style={S.quoteLabel}>Preventivo</Text>
          <Text style={S.quoteNumber}>
            {quote.number}
            {(quote.revision ?? 1) > 1 ? ` — Rev. ${quote.revision}` : ""}
          </Text>
          <Text style={S.quoteDate}>Data: {fmtDate(quote.issuedAt)}</Text>
          {quote.validUntil && (
            <Text style={S.quoteDate}>
              {"Validit\u00e0: "}{fmtDate(quote.validUntil)}
            </Text>
          )}
          {quote.status !== "pending_approval" &&
            quote.status !== "approved" && (
              <View
                style={[
                  S.badge,
                  {
                    backgroundColor:
                      quote.status === "rejected" ||
                      quote.status === "cancelled"
                        ? "#fee2e2"
                        : "#fef3c7",
                    color:
                      quote.status === "rejected" ||
                      quote.status === "cancelled"
                        ? "#991b1b"
                        : "#92400e",
                  },
                ]}
              >
                <Text>{STATUS_LABELS[quote.status] ?? quote.status}</Text>
              </View>
            )}
        </View>
      </View>

      <View style={S.companyInfoRow}>
        <View>
          <Text style={S.companyName}>
            {company?.displayName ?? "Azienda"}
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
  );
}

function ClientSection({ quote, s }: { quote: QuoteDoc; s: PdfStyles }) {
  const S = s;
  const c = quote.clientSnapshot;
  return (
    <View>
      <Text style={S.sectionTitle}>Destinatario</Text>
      <Text style={S.clientName}>{c.displayName}</Text>
      {c.email && <Text style={S.clientMeta}>{c.email}</Text>}
      {c.vatNumber && <Text style={S.clientMeta}>P.IVA {c.vatNumber}</Text>}
      {c.taxCode && <Text style={S.clientMeta}>C.F. {c.taxCode}</Text>}
      {c.address && (
        <Text style={S.clientMeta}>
          {[
            c.address.street,
            [c.address.zip, c.address.city].filter(Boolean).join(" "),
            c.address.province ? `(${c.address.province})` : null,
          ]
            .filter(Boolean)
            .join(" \u2014 ")}
        </Text>
      )}
    </View>
  );
}

function LinesTable({ quote, s }: { quote: QuoteDoc; s: PdfStyles }) {
  const S = s;
  return (
    <View>
      <Text style={S.sectionTitle}>Dettaglio prestazioni</Text>
      <View style={S.tableHeader}>
        <Text style={{ ...S.tableHeaderText, width: "5%" }}>#</Text>
        <Text style={{ ...S.tableHeaderText, width: "85%" }}>Prestazione</Text>
        <Text style={{ ...S.tableHeaderText, width: "10%", textAlign: "right" }}>{"Qt\u00e0"}</Text>
      </View>
      {quote.items.map((item, i) => {
        const name =
          item.kind === "free" ? item.description : item.nameSnapshot;
        return (
          <View
            key={i}
            style={
              i % 2 === 1
                ? { ...S.tableRow, ...S.tableRowAlt }
                : S.tableRow
            }
            wrap={false}
          >
            <Text style={{ ...S.tableCell, width: "5%" }}>{i + 1}</Text>
            <View style={{ width: "85%" }}>
              <Text style={{ ...S.tableCell, fontFamily: "Helvetica-Bold" }}>
                {name}
              </Text>
              {item.kind !== "free" && (
                <Text style={S.itemKindText}>
                  {item.kind === "analysis"
                    ? "Analisi di laboratorio"
                    : "Pacchetto analisi"}
                </Text>
              )}
            </View>
            <Text style={{ ...S.tableCell, width: "10%", textAlign: "right" }}>{item.quantity}</Text>
          </View>
        );
      })}
    </View>
  );
}

function PriceSummaryTable({ quote, s }: { quote: QuoteDoc; s: PdfStyles }) {
  const S = s;
  return (
    <View>
      <View style={S.tableHeader}>
        <Text style={{ ...S.tableHeaderText, ...S.colN }}>#</Text>
        <Text style={{ ...S.tableHeaderText, ...S.colDesc }}>Prestazione</Text>
        <Text style={{ ...S.tableHeaderText, ...S.colQty }}>{"Qt\u00e0"}</Text>
        <Text style={{ ...S.tableHeaderText, ...S.colPrice }}>Prezzo unit.</Text>
        <Text style={{ ...S.tableHeaderText, ...S.colTotal }}>Totale</Text>
      </View>
      {quote.items.map((item, i) => {
        const name =
          item.kind === "free" ? item.description : item.nameSnapshot;
        const lineTotal = Math.round(item.unitPriceCents * item.quantity);
        return (
          <View
            key={i}
            style={
              i % 2 === 1
                ? { ...S.tableRow, ...S.tableRowAlt }
                : S.tableRow
            }
            wrap={false}
          >
            <Text style={{ ...S.tableCell, ...S.colN }}>{i + 1}</Text>
            <Text style={{ ...S.tableCell, ...S.colDesc, fontFamily: "Helvetica-Bold" }}>
              {name}
            </Text>
            <Text style={{ ...S.tableCell, ...S.colQty }}>{item.quantity}</Text>
            <Text style={{ ...S.tableCell, ...S.colPrice }}>
              {eur(item.unitPriceCents)}
            </Text>
            <Text style={{ ...S.tableCell, ...S.colTotal }}>
              {eur(lineTotal)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function TotalsSection({
  quote,
  discountAmounts,
  afterDiscountsCents,
  taxAmountsMap,
  s,
}: {
  quote: QuoteDoc;
  discountAmounts: number[];
  afterDiscountsCents: number;
  taxAmountsMap: { label: string; percent: number; amountCents: number }[];
  s: PdfStyles;
}) {
  const S = s;
  return (
    <View style={S.totalsBlock}>
      <View style={S.totalsRow}>
        <Text style={S.totalsLabel}>Subtotale</Text>
        <Text style={S.totalsValue}>{eur(quote.subtotalCents)}</Text>
      </View>
      {quote.discounts.map((d, i) => {
        const amt = discountAmounts[i] ?? 0;
        return (
          <View key={i} style={S.totalsRow}>
            <Text style={S.totalsLabel}>{d.label}</Text>
            <Text style={S.totalsDiscountValue}>
              {d.type === "percent"
                ? `\u2212${d.value}%  (\u2212${eur(amt)})`
                : `\u2212${eur(amt)}`}
            </Text>
          </View>
        );
      })}
      {taxAmountsMap.length > 0 && (
        <View
          style={{
            ...S.totalsRow,
            borderTop: "0.5pt solid #D1D5DB",
            marginTop: 3,
            paddingTop: 5,
          }}
        >
          <Text style={{ ...S.totalsLabel, fontFamily: "Helvetica-Bold" }}>
            Imponibile
          </Text>
          <Text style={{ ...S.totalsValue, fontFamily: "Helvetica-Bold" }}>
            {eur(afterDiscountsCents)}
          </Text>
        </View>
      )}
      {taxAmountsMap.map((t, i) => (
        <View key={i} style={S.totalsRow}>
          <Text style={S.totalsLabel}>
            {t.label}
            {t.percent > 0 ? ` (${t.percent}%)` : ""}
          </Text>
          <Text style={S.totalsValue}>+{eur(t.amountCents)}</Text>
        </View>
      ))}
      <View style={S.totalsDivider} />
      <View style={S.totalsRow}>
        <Text style={S.grandTotalLabel}>TOTALE</Text>
        <Text style={S.grandTotalValue}>{eur(quote.totalCents)}</Text>
      </View>
    </View>
  );
}

function NotesSection({ notes, s }: { notes: string; s: PdfStyles }) {
  const S = s;
  return (
    <View>
      <Text style={S.sectionTitle}>Note</Text>
      <Text style={S.notesText}>{notes}</Text>
    </View>
  );
}

function EconomicPage({
  quote,
  company,
  discountAmounts,
  afterDiscountsCents,
  taxAmountsMap,
  s,
}: {
  quote: QuoteDoc;
  company: CompanySettingsValues | null;
  discountAmounts: number[];
  afterDiscountsCents: number;
  taxAmountsMap: { label: string; percent: number; amountCents: number }[];
  s: PdfStyles;
}) {
  const S = s;
  const fiscalNote = company?.quoteFiscalNote || DEFAULT_FISCAL_NOTE;

  return (
    <View>
      <Text style={{ ...S.sectionTitle, marginTop: 0 }}>
        Riepilogo economico
      </Text>

      <PriceSummaryTable quote={quote} s={s} />

      <TotalsSection
        quote={quote}
        discountAmounts={discountAmounts}
        afterDiscountsCents={afterDiscountsCents}
        taxAmountsMap={taxAmountsMap}
        s={s}
      />

      <View style={S.fiscalNote}>
        {fiscalNote.split("\n").map((line, i) => (
          <Text
            key={i}
            style={{
              ...S.fiscalNoteText,
              ...(i > 0 ? { marginTop: 3 } : {}),
            }}
          >
            {line}
          </Text>
        ))}
      </View>

      {quote.paymentTerms && (
        <>
          <Text style={S.sectionTitle}>{"Modalit\u00e0 di pagamento"}</Text>
          <Text style={S.paymentLine}>
            {fmtPaymentTerms(quote.paymentTerms)}
          </Text>
          {quote.paymentTerms.accontoCents != null && quote.paymentTerms.accontoCents > 0 && (() => {
            const acconto = quote.paymentTerms!.accontoCents!;
            const accDate = quote.paymentTerms!.accontoDueDate;
            return (
              <Text style={S.paymentLine}>
                {"Acconto: "}{eur(acconto)}
                {accDate ? `  —  entro il ${fmtDate(accDate)}` : ""}
              </Text>
            );
          })()}
          {(() => {
            const pt = quote.paymentTerms!;
            const acconto = pt.accontoCents ?? 0;
            const base = quote.totalCents - acconto;
            const n = pt.installmentsCount;
            if (n <= 0) return null;
            const rataCents = Math.round(base / n);
            const dates = calcInstallmentDates(pt);
            return (
              <>
                {acconto > 0 && (
                  <Text style={S.paymentLine}>
                    {"Importo a rate: "}{eur(base)}{n > 1 ? ` in ${n} rate da ${eur(rataCents)}` : ""}
                  </Text>
                )}
                {dates.length > 0 && dates.map((d, i) => (
                  <Text key={i} style={{ ...S.paymentLine, marginLeft: 8 }}>
                    {`Rata ${i + 1}: ${fmtDate(d)}  —  ${eur(rataCents)}`}
                  </Text>
                ))}
                {dates.length === 0 && pt.firstDueDate && (
                  <Text style={S.paymentLine}>
                    {pt.installmentsCount > 1 ? "Prima scadenza" : "Scadenza"}
                    {": "}{fmtDate(pt.firstDueDate)}
                  </Text>
                )}
              </>
            );
          })()}
          {quote.paymentTerms.notes && (
            <Text style={S.paymentLine}>{quote.paymentTerms.notes}</Text>
          )}
        </>
      )}

      {company?.iban && (
        <Text style={{ ...S.paymentLine, marginTop: 4 }}>
          IBAN: {company.iban}
          {company.bankName ? ` (${company.bankName})` : ""}
        </Text>
      )}
    </View>
  );
}

function ConditionsPage({
  quote,
  company,
  s,
}: {
  quote: QuoteDoc;
  company: CompanySettingsValues | null;
  s: PdfStyles;
}) {
  const S = s;
  const conditionsText = company?.quoteConditions || DEFAULT_CONDITIONS;
  const privacyNote = company?.quotePrivacyNote || DEFAULT_PRIVACY_NOTE;
  const acceptanceText =
    company?.quoteAcceptanceText || DEFAULT_ACCEPTANCE_TEXT;

  const paragraphs = conditionsText
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <View>
      <Text style={S.conditionsPageSectionTitle}>
        {"Condizioni generali del preventivo N\u00b0 "}{quote.number}
        {(quote.revision ?? 1) > 1 ? ` — Rev. ${quote.revision}` : ""}
      </Text>

      {paragraphs.map((para, i) => {
        const nlIdx = para.indexOf("\n");
        if (nlIdx > 0) {
          const title = para.slice(0, nlIdx).trim();
          const body = para.slice(nlIdx + 1).trim();
          return (
            <View key={i} style={{ marginBottom: 8 }} wrap={false}>
              <Text style={S.conditionArticleTitle}>
                {title}
              </Text>
              <Text style={S.conditionText}>{body}</Text>
            </View>
          );
        }
        return (
          <Text key={i} style={S.conditionText}>
            {para}
          </Text>
        );
      })}

      <View wrap={false}>
        <Text style={S.sectionTitle}>Trattamento dati e privacy</Text>
        <Text style={S.conditionText}>{privacyNote}</Text>
      </View>

      <View
        style={{
          marginTop: 12,
          padding: "10pt 12pt",
          border: "1pt solid #D1D5DB",
          borderRadius: 4,
        }}
        wrap={false}
      >
        <Text style={S.acceptanceBoxTitle}>
          Accettazione del preventivo
        </Text>
        <Text style={S.acceptanceBoxBody}>
          {acceptanceText}
        </Text>

        <View style={{ ...S.sigRow, marginTop: 20 }}>
          <View style={{ flex: 1 }}>
            <View style={S.sigLine} />
            <Text style={S.sigLabel}>Data e luogo</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={S.sigLine} />
            <Text style={S.sigLabel}>
              {"Firma del committente \u2014 Accettazione"}
            </Text>
          </View>
        </View>

        <View style={{ ...S.sigRow, marginTop: 22 }}>
          <View style={{ flex: 1 }} />
          <View style={{ flex: 1 }}>
            <View style={S.sigLine} />
            <Text style={S.sigLabel}>
              {"Firma del committente \u2014 Approvazione specifica\ndelle clausole (artt. 1341-1342 c.c.)"}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function DraftWatermark() {
  return (
    <View style={WM.container} fixed>
      <Text style={WM.text}>BOZZA</Text>
    </View>
  );
}

function ImageWatermark({ url, rotation = -45 }: { url: string; rotation?: number }) {
  return (
    <View style={WM.container} fixed>
      <Image
        src={url}
        style={{
          width: 400,
          height: 400,
          objectFit: "contain",
          opacity: 0.06,
          transform: `rotate(${rotation}deg)`,
        }}
      />
    </View>
  );
}

function PdfFooter({ company, s }: { company: CompanySettingsValues | null; s: PdfStyles }) {
  const S = s;
  const parts = [
    company?.legalName,
    company?.vatNumber && `P.IVA ${company.vatNumber}`,
    company?.quoteFooterNote,
  ].filter(Boolean);

  return (
    <View style={S.footer} fixed>
      <Text style={S.footerText}>{parts.join(" \u2014 ")}</Text>
      <Text
        style={S.footerText}
        render={({ pageNumber, totalPages }) =>
          `Pag. ${pageNumber}/${totalPages}`
        }
      />
    </View>
  );
}

// ── Main export ───────────────────────────────────────────────────────

interface Props {
  quote: QuoteDoc;
  company: CompanySettingsValues | null;
}

export function QuotePdfDocument({ quote, company }: Props) {
  const isDraft = quote.status === "draft";
  const watermarkUrl = company?.watermarkEnabled
    ? company.watermarkUrl || company.logoUrl || null
    : null;
  const watermarkRotation = company?.watermarkRotation ?? -45;
  const scale = FONT_SCALE[company?.quoteFontSize ?? "md"] ?? 1;
  const S = makeStyles(scale);

  const discountAmounts = quote.discounts.reduce<{
    amounts: number[];
    running: number;
  }>(
    (acc, d) => {
      const amtCents =
        d.type === "percent"
          ? Math.round((acc.running * d.value) / 100)
          : d.value;
      return {
        amounts: [...acc.amounts, amtCents],
        running: acc.running - amtCents,
      };
    },
    { amounts: [], running: quote.subtotalCents },
  ).amounts;

  const afterDiscountsCents = discountAmounts.reduce(
    (acc, amt) => acc - amt,
    quote.subtotalCents,
  );
  const taxAmountsMap = quote.taxes
    .filter((t) => t.applied)
    .map((t) => ({
      label: t.label,
      percent: t.percent,
      amountCents: Math.round((afterDiscountsCents * t.percent) / 100),
    }));

  return (
    <Document
      title={`Preventivo ${quote.number}`}
      author={company?.legalName ?? "Azienda"}
      subject={`Preventivo ${quote.number} \u2014 ${quote.clientSnapshot.displayName}`}
      creator="CRM"
    >
      {/* Pagina 1: cosa facciamo */}
      <Page size="A4" style={S.page}>
        {isDraft && !watermarkUrl && <DraftWatermark />}
        {watermarkUrl && <ImageWatermark url={watermarkUrl} rotation={watermarkRotation} />}
        <PdfFooter company={company} s={S} />
        <PdfHeader quote={quote} company={company} s={S} />
        <ClientSection quote={quote} s={S} />
        <LinesTable quote={quote} s={S} />
        {quote.notes && <NotesSection notes={quote.notes} s={S} />}
      </Page>

      {/* Pagina 2: quanto costa */}
      <Page size="A4" style={S.page}>
        {isDraft && !watermarkUrl && <DraftWatermark />}
        {watermarkUrl && <ImageWatermark url={watermarkUrl} rotation={watermarkRotation} />}
        <PdfFooter company={company} s={S} />
        <PdfHeader quote={quote} company={company} s={S} />
        <EconomicPage
          quote={quote}
          company={company}
          discountAmounts={discountAmounts}
          afterDiscountsCents={afterDiscountsCents}
          taxAmountsMap={taxAmountsMap}
          s={S}
        />
      </Page>

      {/* Pagina 3: condizioni + accettazione e firma */}
      <Page size="A4" style={S.page}>
        {isDraft && !watermarkUrl && <DraftWatermark />}
        {watermarkUrl && <ImageWatermark url={watermarkUrl} rotation={watermarkRotation} />}
        <PdfFooter company={company} s={S} />
        <PdfHeader quote={quote} company={company} s={S} />
        <ConditionsPage quote={quote} company={company} s={S} />
      </Page>
    </Document>
  );
}

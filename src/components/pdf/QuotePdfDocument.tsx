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

  // Condizioni di pagamento
  paymentSection: {
    marginTop: 14,
    padding: "10pt 12pt",
    backgroundColor: "#f0f5f2",
    borderLeft: "2pt solid #1A4D3E",
    borderRadius: 2,
  },
  paymentLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#888", textTransform: "uppercase", marginBottom: 6 },
  paymentRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, paddingVertical: 2 },
  paymentKey: { fontSize: 8.5, color: "#555" },
  paymentValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  paymentNotes: { fontSize: 8, color: "#555", marginTop: 6, lineHeight: 1.5 },

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

  // Numero riga tabella
  colNum: { width: 18, textAlign: "right" as const },

  // Nota fiscale
  fiscalNoteSection: {
    marginTop: 14,
    padding: "10pt 12pt",
    backgroundColor: "#f5f9f7",
    borderLeft: "2pt solid #2d6a4f",
    borderRadius: 2,
  },
  fiscalNoteLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#888", textTransform: "uppercase" as const, marginBottom: 6 },
  fiscalNoteText: { fontSize: 8, color: "#444", lineHeight: 1.6 },

  // Pagina condizioni generali
  conditionsPage: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#111",
    padding: "36pt 48pt",
    lineHeight: 1.4,
  },
  condTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#1A4D3E",
    marginBottom: 12,
    borderBottom: "1pt solid #1A4D3E",
    paddingBottom: 5,
  },
  condSection: { marginBottom: 8 },
  condSectionTitle: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: "#1A4D3E",
    marginBottom: 2,
    textTransform: "uppercase" as const,
  },
  condText: { fontSize: 8, color: "#333", lineHeight: 1.5 },
  acceptanceBox: {
    marginTop: 12,
    padding: "10pt 12pt",
    border: "1pt solid #ccc",
    borderRadius: 4,
  },
  acceptTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#1A4D3E",
    marginBottom: 6,
  },
  acceptText: { fontSize: 8, color: "#444", lineHeight: 1.5, marginBottom: 8 },

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

function formatSimpleDatePdf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatPaymentTermsLabel(pt: NonNullable<QuoteDoc["paymentTerms"]>): string {
  if (pt.installmentsCount === 1) return "Unica soluzione";
  let cadence = "";
  if (pt.installmentPeriod === "monthly") cadence = "mensili";
  else if (pt.installmentPeriod === "biweekly") cadence = "bisettimanali";
  else if (pt.installmentPeriod === "custom" && pt.customInterval && pt.customUnit) {
    const unit = pt.customUnit === "days" ? "giorni" : pt.customUnit === "years" ? "anni" : "mesi";
    cadence = `ogni ${pt.customInterval} ${unit}`;
  }
  return `${pt.installmentsCount} rate ${cadence}`.trim();
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

  // Imponibile post-sconto e importi tasse effettivi
  const afterDiscountsCents = discountAmounts.reduce((acc, amt) => acc - amt, quote.subtotalCents);
  const taxAmountsMap = quote.taxes
    .filter((t) => t.applied)
    .map((t) => ({
      label: t.label,
      percent: t.percent,
      amountCents: Math.round(afterDiscountsCents * t.percent / 100),
    }));

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
            {quote.status !== "pending_approval" && quote.status !== "approved" && (
              <View
                style={[
                  S.badge,
                  {
                    backgroundColor:
                      quote.status === "rejected" || quote.status === "cancelled"
                        ? "#fee2e2"
                        : "#fef3c7",
                    color:
                      quote.status === "rejected" || quote.status === "cancelled"
                        ? "#991b1b"
                        : "#92400e",
                  },
                ]}>
                <Text>{STATUS_LABELS[quote.status] ?? quote.status}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── TABELLA VOCI ── */}
        {/* Intestazioni colonne */}
        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderText, S.colNum]}>#</Text>
          <Text style={[S.tableHeaderText, S.colDesc, { marginLeft: 8 }]}>Descrizione</Text>
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
              <Text style={[S.cellText, S.colNum, { color: "#999", fontSize: 8 }]}>{i + 1}</Text>
              <View style={[S.colDesc, { marginLeft: 8 }]}>
                <Text style={S.itemName}>{name}</Text>
                {item.kind !== "free" && (
                  <Text style={S.itemSub}>
                    {item.kind === "analysis" ? "Analisi di laboratorio" : "Pacchetto analisi"}
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

          {/* Imponibile post-sconto (solo se ci sono contributi/tasse) */}
          {taxAmountsMap.length > 0 && (
            <View style={[S.totalsRow, { borderTop: "0.5pt solid #ddd", marginTop: 3, paddingTop: 5 }]}>
              <Text style={[S.totalsLabel, { fontFamily: "Helvetica-Bold" }]}>Imponibile</Text>
              <Text style={[S.totalsValue, { fontFamily: "Helvetica-Bold" }]}>{formatEurPdf(afterDiscountsCents)}</Text>
            </View>
          )}

          {/* Contributi previdenziali e tasse applicate — mostra importo effettivo */}
          {taxAmountsMap.map((t, i) => (
            <View key={i} style={S.totalsRow}>
              <Text style={S.totalsLabel}>{t.label}{t.percent > 0 ? ` (${t.percent}%)` : ""}</Text>
              <Text style={S.totalsValue}>+{formatEurPdf(t.amountCents)}</Text>
            </View>
          ))}

          <View style={S.totalsDivider} />

          {/* Totale finale */}
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>TOTALE</Text>
            <Text style={S.totalValue}>{formatEurPdf(quote.totalCents)}</Text>
          </View>
        </View>

        {/* ── CONDIZIONI DI PAGAMENTO ── */}
        {quote.paymentTerms && (
          <View style={S.paymentSection}>
            <Text style={S.paymentLabel}>Condizioni di pagamento</Text>
            <View style={S.paymentRow}>
              <Text style={S.paymentKey}>Modalità</Text>
              <Text style={S.paymentValue}>
                {formatPaymentTermsLabel(quote.paymentTerms)}
              </Text>
            </View>
            {quote.paymentTerms.installmentsCount > 1 && quote.paymentTerms.firstDueDate && (
              <View style={S.paymentRow}>
                <Text style={S.paymentKey}>Prima scadenza</Text>
                <Text style={S.paymentValue}>
                  {formatSimpleDatePdf(quote.paymentTerms.firstDueDate)}
                </Text>
              </View>
            )}
            {quote.paymentTerms.installmentsCount === 1 && quote.paymentTerms.firstDueDate && (
              <View style={S.paymentRow}>
                <Text style={S.paymentKey}>Scadenza</Text>
                <Text style={S.paymentValue}>
                  {formatSimpleDatePdf(quote.paymentTerms.firstDueDate)}
                </Text>
              </View>
            )}
            {quote.paymentTerms.notes ? (
              <Text style={S.paymentNotes}>{quote.paymentTerms.notes}</Text>
            ) : null}
          </View>
        )}

        {/* ── NOTA FISCALE ── */}
        <View style={S.fiscalNoteSection}>
          <Text style={S.fiscalNoteLabel}>Note fiscali e previdenziali</Text>
          <Text style={S.fiscalNoteText}>
            Operazione senza applicazione dell{"'"}IVA ai sensi dell{"'"}art. 1, commi 54-89, L. 190/2014 — regime forfettario.
          </Text>
          {taxAmountsMap.length > 0 && (
            <Text style={[S.fiscalNoteText, { marginTop: 3 }]}>
              Compenso soggetto a contributo previdenziale ENPAIA/Cassa agrotecnici nella misura indicata, da applicare sull{"'"}imponibile. Il contributo è a carico del committente ai sensi dell{"'"}art. 1, c. 212, L. 662/1996.
            </Text>
          )}
          <Text style={[S.fiscalNoteText, { marginTop: 3 }]}>
            Il compenso non è soggetto a ritenuta d{"'"}acconto ai sensi dell{"'"}art. 1, comma 67, L. 190/2014.
          </Text>
          <Text style={[S.fiscalNoteText, { marginTop: 3 }]}>
            L{"'"}eventuale imposta di bollo su fattura elettronica (€ 2,00) è dovuta nei casi previsti dalla normativa vigente.
          </Text>
        </View>

        {/* ── FIRMA ── */}
        <View style={S.signatureRow}>
          <View style={S.signatureBlock}>
            <Text style={S.signatureLabel}>Data e luogo</Text>
            <View style={S.signatureLine} />
          </View>
          <View style={S.signatureBlock}>
            <Text style={S.signatureLabel}>Timbro e Firma</Text>
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

      {/* ══ PAGINA CONDIZIONI GENERALI ══ */}
      <Page size="A4" style={S.conditionsPage}>
        <Text style={S.condTitle}>Condizioni generali del preventivo N° {quote.number}</Text>

        <View style={S.condSection}>
          <Text style={S.condSectionTitle}>1. Validità del preventivo</Text>
          <Text style={S.condText}>
            Il presente preventivo ha validità 30 giorni dalla data di emissione, salvo espressa proroga
            concordata per iscritto. Decorso tale termine, il professionista si riserva di aggiornare le
            condizioni economiche senza preavviso.
          </Text>
        </View>

        <View style={S.condSection}>
          <Text style={S.condSectionTitle}>2. Avvio delle attività</Text>
          <Text style={S.condText}>
            Le attività avranno inizio previo ricevimento della presente accettazione firmata e, ove
            concordato, del relativo acconto. L{"'"}avvio non è subordinato a termini automatici ed è
            condizionato alla ricezione di tutta la documentazione, dei campioni e delle informazioni
            necessarie all{"'"}esecuzione dell{"'"}incarico.
          </Text>
        </View>

        <View style={S.condSection}>
          <Text style={S.condSectionTitle}>3. Esclusioni e attività extra</Text>
          <Text style={S.condText}>
            Sono escluse dal presente preventivo tutte le attività non esplicitamente descritte.
            Qualsiasi prestazione aggiuntiva, variazione di scope o analisi supplementare non inclusa
            nell{"'"}offerta dovrà essere preventivamente concordata per iscritto e sarà oggetto di
            separata quotazione.
          </Text>
        </View>

        <View style={S.condSection}>
          <Text style={S.condSectionTitle}>4. Costi aggiuntivi</Text>
          <Text style={S.condText}>
            Eventuali spese per trasferte, sopralluoghi in cantina, campionamenti, materiali di consumo
            specifici, spedizioni di campioni, analisi straordinarie o interventi urgenti non inclusi
            nell{"'"}offerta saranno fatturati separatamente previo accordo tra le parti, sulla base dei
            costi effettivamente sostenuti.
          </Text>
        </View>

        <View style={S.condSection}>
          <Text style={S.condSectionTitle}>5. Tempistiche</Text>
          <Text style={S.condText}>
            Le tempistiche indicate sono da intendersi come puramente indicative in condizioni operative
            ordinarie. Il professionista non si assume responsabilità per ritardi imputabili al mancato
            o tardivo conferimento di campioni, dati analitici, documentazione tecnica o informazioni da
            parte del committente. In tali casi le scadenze potranno slittare proporzionalmente senza
            che ciò costituisca inadempimento contrattuale.
          </Text>
        </View>

        <View style={S.condSection}>
          <Text style={S.condSectionTitle}>6. Regime fiscale e previdenziale</Text>
          <Text style={S.condText}>
            Operazione senza applicazione dell{"'"}IVA ai sensi dell{"'"}art. 1, commi 54-89, L. 190/2014
            — regime forfettario. Il compenso non è soggetto a ritenuta d{"'"}acconto ai sensi dell{"'"}art. 1,
            comma 67, L. 190/2014. Al compenso imponibile è applicato il contributo previdenziale
            ENPAIA/Cassa agrotecnici al 4%, a carico del committente ai sensi dell{"'"}art. 1, c. 212,
            L. 662/1996. L{"'"}eventuale imposta di bollo su fattura elettronica (€ 2,00) è dovuta nei
            casi previsti dalla normativa vigente.
          </Text>
        </View>

        <View style={S.condSection}>
          <Text style={S.condSectionTitle}>7. Riservatezza e trattamento dei dati personali (GDPR)</Text>
          <Text style={S.condText}>
            I dati personali del committente saranno trattati ai sensi del Regolamento UE 2016/679
            (GDPR) e della normativa nazionale vigente, esclusivamente per le finalità connesse
            all{"'"}esecuzione del presente incarico professionale e agli obblighi fiscali e previdenziali
            conseguenti. I dati non saranno comunicati a terzi, salvo i casi previsti dalla legge.
            Il committente ha diritto di accesso, rettifica, cancellazione e opposizione al trattamento,
            rivolgendosi al titolare del trattamento.
          </Text>
        </View>

        {/* Accettazione */}
        <View style={S.acceptanceBox}>
          <Text style={S.acceptTitle}>Accettazione del preventivo</Text>
          <Text style={S.acceptText}>
            Il committente, con la firma del presente documento, dichiara di accettare integralmente le
            condizioni economiche e contrattuali del preventivo N° {quote.number}, nonché di approvare
            specificamente, ai sensi degli artt. 1341 e 1342 c.c., le seguenti clausole: art. 3
            (esclusioni e attività extra), art. 4 (costi aggiuntivi), art. 5 (tempistiche e ritardi),
            art. 6 (regime fiscale e previdenziale).
          </Text>

          {/* Riga firme accettazione */}
          <View style={[S.signatureRow, { marginTop: 20 }]}>
            <View style={S.signatureBlock}>
              <Text style={S.signatureLabel}>Data e luogo</Text>
              <View style={S.signatureLine} />
            </View>
            <View style={S.signatureBlock}>
              <Text style={S.signatureLabel}>Firma del committente — Accettazione</Text>
              <View style={S.signatureLine} />
            </View>
          </View>

          {/* Riga firma approvazione specifica clausole */}
          <View style={[S.signatureRow, { marginTop: 22 }]}>
            <View style={S.signatureBlock}>
              <Text style={S.signatureLabel}>
                Firma del committente — Approvazione specifica{"\n"}delle clausole (artt. 1341-1342 c.c.)
              </Text>
              <View style={S.signatureLine} />
            </View>
            <View style={S.signatureBlock}>
              <Text style={S.signatureLabel}>Il professionista</Text>
              <View style={S.signatureLine} />
            </View>
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

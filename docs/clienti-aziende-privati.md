# Clienti: liste separate aziende e privati — documento di sviluppo

> **Obiettivo**: due pagine distinte per aziende e privati, con colonne pertinenti a ciascun tipo.
> Il modello dati non cambia: cambia solo come i clienti vengono elencati e raggiunti.
>
> **Stato**: da implementare. **Fonte**: appunti cliente 20/09/2026, punto #4.

---

## 1. Richiesta del cliente

> *"Dentro clienti separare in due pagine aziende e privati. Concettualmente rimane uguale ma
> saranno due liste separate."*

---

## 2. Stato attuale

**Il modello distingue già i due tipi** — `src/schemas/client.ts`: `ClientFormSchema` è una
`z.discriminatedUnion("type", [...])` (`:56-59`) con valori **`"business"`** e
**`"individual"`**.

- `zBusinessClient` (`:40-46`): `type: "business"`, `vatNumber` **obbligatoria**, `sdiCode?`,
  `pec?`, `taxCode?`
- `zIndividualClient` (`:48-54`): `type: "individual"`, `firstName`, `lastName`, `taxCode?`,
  `vatNumber?` opzionale
- base comune (`:30-38`): `displayName`, `email`, `phone`, `address?`, `billingAddress?`,
  `notes?`, `tags?`

Quindi **non serve nessuna migrazione dati**.

Lato UI oggi c'è una lista sola:

- `src/app/(app)/clients/page.tsx` — server component, `getClients({ includeArchived: true })`,
  passa `initialData` a `ClientsClient`
- `src/app/(app)/clients/_components/ClientsClient.tsx` — `DataTable` (TanStack), stato locale
  `search` e `showArchived` (`:59-60`), filtro client-side a `:65-77` che **già ramifica** su
  `c.type === "business"` / `"individual"` (`:73-75`), Sheet per nuovo cliente con `ClientForm`,
  Dialog archiviazione, `CsvExportButton`
- dettaglio: `clients/[id]/page.tsx` + `clients/[id]/layout.tsx` (header + rail sinistro con
  `/samples`, `/quotes`, `/reports`, `/packages`, `/payments`, `/reminders`)
- navigazione: voce "Clienti" nel gruppo **Clientela** di `src/components/app-shell/Sidebar.tsx`
  (`:42-81`), voce in `src/components/app-shell/MobileNav.tsx`, e `COMMAND_NAV` nella palette ⌘K
  di `src/components/app-shell/Topbar.tsx:58-68`

---

## 3. Decisioni tecniche

1. **Due sotto-rotte statiche**: `/clients/aziende` e `/clients/privati`.
   In Next.js un segmento statico ha precedenza su `[id]`, quindi convivono senza conflitti con
   `/clients/{id}`. (Un cliente il cui id fosse letteralmente `aziende` non sarebbe
   raggiungibile: caso irrealistico con gli id Firestore, non va gestito.)
2. `/clients` fa **`redirect("/clients/aziende")`**: tutti i link esistenti verso `/clients`
   continuano a funzionare senza doverli rincorrere.
3. **Un solo componente lista**, `ClientsClient`, che riceve una prop `type` e si adatta. Non
   duplicare il componente: le due liste condividono ricerca, archiviazione, export CSV e
   creazione, e duplicarlo significherebbe mantenere due volte ogni fix futuro.
4. In sidebar **due voci separate**, "Aziende" e "Privati", sotto il gruppo Clientela esistente.
   Due pagine vere, non due tab: coerente con la regola no-tab di PROJECT_SPEC.md §17.
5. Le colonne cambiano per tipo, perché i campi rilevanti sono diversi (P.IVA/SDI per le aziende,
   nome/cognome/CF per i privati).

---

## 4. Implementazione

### 4.1 Rotte

**`src/app/(app)/clients/page.tsx`** — sostituire il contenuto con un redirect:

```ts
import { redirect } from "next/navigation";

export default function ClientsPage() {
  redirect("/clients/aziende");
}
```

**`src/app/(app)/clients/aziende/page.tsx`** e **`src/app/(app)/clients/privati/page.tsx`** —
server component ciascuna, stessa forma dell'attuale `clients/page.tsx` (stessa fetch
`getClients({ includeArchived: true })`), che rendono `<ClientsClient initialData={...}
type="business" />` e `type="individual"` rispettivamente.

Il filtro per tipo si fa **nel componente** (i dati sono già tutti caricati e filtrati
client-side: vedi `:65-77`), non con due query Firestore separate — non serve un indice nuovo e
il volume di clienti di un laboratorio non lo giustifica.

### 4.2 `ClientsClient.tsx`

- nuova prop obbligatoria `type: "business" | "individual"`;
- il filtro a `:65-77` aggiunge la condizione `c.type === type`;
- **colonne per tipo**:
  - aziende: Ragione sociale (`displayName`), P.IVA (`vatNumber`), Email, Telefono, stats, azioni
  - privati: Nome (`firstName` + `lastName`, con fallback su `displayName`), Codice fiscale
    (`taxCode`), Email, Telefono, stats, azioni
  Le colonne comuni restano definite una volta sola; cambia solo il blocco specifico.
- il click riga continua a portare al dettaglio `/clients/{id}` (invariato);
- lo **Sheet "Nuovo cliente"** deve aprirsi già sul tipo della pagina corrente: passare `type` a
  `ClientForm` come valore iniziale del discriminante. Verificare come `ClientForm` gestisce oggi
  la scelta del tipo e mantenere la possibilità di cambiarlo, se già esiste;
- titolo e stato vuoto della pagina devono dire quale lista è ("Nessuna azienda trovata" /
  "Nessun privato trovato");
- il nome file dell'export CSV deve distinguere le due liste.

### 4.3 Navigazione

- `src/components/app-shell/Sidebar.tsx` (gruppo Clientela, `:42-81`): sostituire la voce
  "Clienti" con **"Aziende"** (`/clients/aziende`) e **"Privati"** (`/clients/privati`), icone
  `lucide-react` stroke 1.75 coerenti con le altre (es. `Building2` e `User`).
- `src/components/app-shell/MobileNav.tsx`: la voce clienti della barra inferiore punta a
  `/clients/aziende`.
- `src/components/app-shell/Topbar.tsx:58-68` (`COMMAND_NAV`, palette ⌘K): aggiornare la voce
  clienti in due voci, come in sidebar.
- Verificare che lo stato "attivo" della voce di sidebar si accenda correttamente su entrambe:
  se il confronto è per prefisso, `/clients/aziende` e `/clients/privati` non devono risultare
  entrambe attive contemporaneamente, né accendersi quando si è su `/clients/{id}/...`.

### 4.4 Revalidation — dettaglio da non saltare

`revalidatePath("/clients")` **non rivalida le sotto-rotte**: rivalida solo quella pagina, che
dopo questo lavoro è un semplice redirect. La correzione più pulita è passare il secondo
argomento — `revalidatePath("/clients", "layout")` — che copre la rotta e tutte quelle annidate;
in alternativa si elencano esplicitamente `/clients/aziende` e `/clients/privati`. I call site sono in
`src/server/actions/clients.ts` (`createClient` `:125`, `updateClient` `:168`, `archiveClient`
`:218`, `restoreClient` `:239`) e in `src/server/actions/payments.ts:275` (che aggiorna le stats
cliente).

Se non si fa, dopo aver creato o archiviato un cliente la lista resta vecchia finché non si
ricarica a mano: è esattamente il tipo di regressione che sfugge ai test e si nota solo in uso.

---

## 5. Criteri di accettazione

- [ ] `/clients` reindirizza a `/clients/aziende`.
- [ ] `/clients/aziende` elenca **solo** clienti `type === "business"`; `/clients/privati` solo
      `type === "individual"`. La somma delle due liste è pari al totale dei clienti.
- [ ] Le colonne sono quelle previste per ciascun tipo (P.IVA sulle aziende, CF sui privati).
- [ ] Da `/clients/privati` il pulsante "Nuovo cliente" apre il form già su tipo privato, e il
      cliente creato compare in quella lista.
- [ ] Ricerca, "mostra archiviati", archiviazione/ripristino ed export CSV funzionano su entrambe.
- [ ] Creando o archiviando un cliente la lista si aggiorna **senza ricaricare la pagina a mano**.
- [ ] Il dettaglio cliente `/clients/{id}` e tutte le sue sotto-pagine sono invariati e
      raggiungibili da entrambe le liste.
- [ ] Sidebar, barra mobile e palette ⌘K portano alle pagine giuste, con l'evidenziazione della
      voce attiva corretta.
- [ ] `npm run check` verde.

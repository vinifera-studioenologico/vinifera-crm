# Modulo "Eventi" — CRM + Sito (viniferastudioenologico.it)

> Documento di brainstorming pre-specifica tecnica. Obiettivo: passare questo a Opus per la fase di architettura/design dettagliato, prima dell'esecuzione con Claude Code.

## Contesto

Cliente: Vinifera Studio Enologico (analisi vini + eventi/degustazioni).
P.IVA ordinaria. **Ricevuta/promemoria PDF automatica da Stripe all'acquirente; la fattura elettronica vera la emette la commercialista a mano su EasyCloudFatt**, usando i dati del profilo di fatturazione già pronti nel CRM. Scelta fatta per il pattern d'uso reale (eventi sporadici, es. uno ogni 6 mesi): un servizio di automazione a pagamento come A-Cube avrebbe senso solo se il costo scattasse esclusivamente nei mesi di reale utilizzo, ma questo non è chiaro dalle informazioni pubbliche disponibili — quindi si evita il rischio di un abbonamento dimenticato acceso nei mesi morti. Da rivalutare in futuro se la frequenza degli eventi aumentasse.

**Nota terminologica (importante, per evitare ambiguità nel resto del documento):**
- **Cliente** = sempre e solo Vinifera Studio Enologico (il committente di questo progetto).
- **Acquirente** = chi prenota sul sito, paga, ed è il referente unico di contatto per l'ordine (email + telefono).
- **Partecipante** = ciascuna persona inserita nell'ordine (solo nome e cognome), non ha contatti propri nel sistema.

## Obiettivo generale

- CRM: creare, modificare, pubblicare/nascondere eventi.
- Sito: sezione eventi dedicata + eventi "in evidenza" mostrati in home come banner immediato ("stile videogame") appena si atterra sul sito.
- Pagamento online (Stripe) con posti limitati.
- Storico eventi + storico acquirenti (match su email e/o telefono).
- Recap entrate su CRM per il cliente/commercialista.

## Decisioni già prese (in questa sessione)

| Tema | Decisione |
|---|---|
| Fatturazione | **Ricevuta/promemoria PDF da Stripe all'acquirente** + **fattura elettronica fatta a mano dalla commercialista su EasyCloudFatt**, sui dati del profilo di fatturazione già pronti nel CRM. Scelto per il pattern d'uso sporadico degli eventi (no abbonamenti a servizi terzi che rischiano di restare accesi nei mesi morti). A-Cube resta annotato come opzione futura se la frequenza eventi aumentasse |
| Multi-posto per ordine | Sì, un ordine può contenere più posti/persone |
| Dati acquirente (referente ordine) | **Email e telefono obbligatori**, inseriti all'inizio del form di prenotazione — è il referente unico per tutto l'ordine |
| Dati per singolo partecipante | **Solo nome e cognome** — nessun contatto proprio, tutte le comunicazioni passano dall'acquirente |
| Prezzo per evento | Unico per ora — un solo prezzo per evento (no fasce multiple), riprendendo la logica sconti già esistente nella sezione "Servizi". Fasce multiple rimandate a eventuale fase 2 |
| Rimborsi | Automatico se l'admin cancella l'evento (**rimborso pieno**, fee Stripe assorbita); manuale (via bottone in CRM) per le altre casistiche |
| Waitlist | Non prevista |
| Ruoli CRM | Nessun sistema di ruoli/permessi, admin unico |
| Gestore pagamenti | Stripe (Checkout o Payment Element — da decidere in fase tecnica) |
| Notifiche acquirente | Resend, già integrato nel CRM — si riusa per promemoria prenotazione, conferma pagamento, notifica rimborso/cancellazione evento (**solo all'acquirente**, i partecipanti non hanno contatti propri), e per le email della mailing list "Tienimi aggiornato" (conferma iscrizione, notifica nuovo evento prenotabile) |
| Banner "in evidenza" in home | Non un modale full-screen (penalizzato su mobile e in generale dalle best practice UX), ma un banner/slide-in in alto, non bloccante, dismissibile, che ricompare una volta per sessione — da confermare in fase di design UI |
| Overbooking su riduzione capienza | Se la capienza viene abbassata sotto il venduto: il sistema blocca subito le nuove prenotazioni e allerta l'admin che è oltre soglia; il rimborso dei biglietti in eccesso è manuale, uno per uno, dal CRM |
| Evento "in evidenza" + sold-out/concluso | Va tolto automaticamente dal banner in evidenza quando lo stato non è più "prenotabile" |
| Notifica ai partecipanti per modifiche evento | Bottone dentro la scheda evento in CRM: "Notifica tutti", oggetto e testo liberi, invio via Resend a tutti i partecipanti dell'evento — contenuto a discrezione di Vinifera |
| Eventi ricorrenti | Da prevedere fin da subito nel modello (non solo eventi singoli) |
| Timer di hold posti nel checkout | **Visibile in tempo reale all'utente** (countdown, stile TicketOne), non un timeout silenzioso lato server. Alla scadenza, schermata dedicata con il dettaglio ("avevi 15 minuti per completare il pagamento, sono scaduti, il posto è stato rilasciato") — non un errore generico o un redirect muto |
| Recap entrate CRM | Serve principalmente **al cliente** (Vinifera) per vedere quanto incassa dagli eventi, non è un output formale per il commercialista — quindi più semplice: dashboard, non necessariamente export strutturato |
| Limite posti per singolo ordine | In fase di creazione evento, Vinifera può impostare un numero massimo di posti acquistabili in un solo ordine (es. max 4 a testa). **Default: libero (nessun limite)**, il campo va valorizzato solo se Vinifera lo richiede per quell'evento specifico |

## Profilo di fatturazione (checkout)

Alla fine del checkout, oltre ai dati acquirente/partecipanti, si raccoglie un **profilo di fatturazione**, con scelta tra "Privato" e "Azienda". Scopo: dare alla commercialista di Vinifera dati già puliti e strutturati per emettere la fattura vera su EasyCloudFatt, senza dover richiedere nulla manualmente all'acquirente dopo l'acquisto.

**Privato — campi obbligatori:**
- Nome e Cognome
- Codice Fiscale *(necessario per legge per poter fatturare, non solo per la ricevuta)*
- Indirizzo di residenza completo (via, CAP, città, provincia)

**Azienda — campi obbligatori:**
- Ragione Sociale
- Partita IVA
- Indirizzo sede legale
- Codice Destinatario SDI (7 caratteri) oppure PEC (almeno uno dei due)

**Azienda — campi facoltativi:**
- Codice Fiscale (se diverso dalla P.IVA)
- Nome referente amministrativo (se diverso dall'acquirente)

*(Email e telefono non si ripetono qui: sono già raccolti come dati dell'acquirente all'inizio del form.)*

## Mailing list "Tienimi aggiornato" (sito)

Diversa dai partecipanti/acquirenti di un ordine: è una lista di sole email, pensata per chi vuole restare informato sui nuovi eventi senza aver ancora prenotato nulla.

- **Punto di raccolta**: bottone "Tienimi aggiornato" nella pagina eventi del sito (non legato a un evento specifico), solo campo email + checkbox di consenso esplicito (obbligatoria per legge, il campo email da solo non basta).
- **Doppia conferma (double opt-in)**: dopo l'iscrizione, email con link di conferma prima di essere aggiunti alla lista attiva — riduce spam, errori di battitura ed è più sicuro per la deliverability.
- **Disiscrizione**: ogni email inviata deve avere un link di disiscrizione, obbligatorio per legge.
- **Cosa scatena una notifica**: solo eventi "positivi" — un evento diventa prenotabile (posti disponibili). **Una sola notifica per evento**, nel momento esatto in cui diventa prenotabile per la prima volta (anche se prima è passato da "prossimamente"), per evitare doppie email sullo stesso evento.
- **Cosa NON scatena una notifica**: sold-out, evento chiuso/concluso, evento cancellato.
- **Entità separata**: questa lista non si fonde con l'anagrafica Acquirente/storico ordini — è marketing puro, anche se la stessa persona può comparire in entrambe.
- **Gestione lato CRM**: Vinifera deve poter vedere l'elenco iscritti, rimuovere manualmente un indirizzo se richiesto (es. richiesta di cancellazione dati), ed esportarlo se serve — anche solo una vista semplice, non serve altro.

## Aggiornamento informativa privacy

Prima del lancio, l'informativa privacy del sito va aggiornata per coprire i nuovi trattamenti introdotti da questo modulo:
- Dati acquirente (email, telefono) e partecipanti (nome, cognome).
- Dati del profilo di fatturazione (privato: CF, indirizzo; azienda: P.IVA, ragione sociale, SDI/PEC).
- Matching storico acquirenti su email/telefono tra ordini diversi (profilazione leggera, va dichiarata).
- Iscrizione alla mailing list "Tienimi aggiornato" (consenso separato, marketing).
- Eventuali dati passati a servizi terzi coinvolti nel flusso (Stripe per i pagamenti, Resend per le email transazionali, la commercialista/EasyCloudFatt per l'emissione della fattura).

Non è un compito per Opus/Claude Code: è testo legale, va scritto o rivisto da Vinifera/commercialista o da chi si occupa già dell'informativa esistente sul sito. Va solo ricordato come attività da fare prima di andare live, non da dimenticare.

## Architettura: due repository separati

**Il sito pubblico e il CRM sono due repository/progetti Next.js distinti**, accoppiati solo tramite un'**integrazione REST su HTTPS con bearer token condiviso** (`CRM_API_KEY`, identico in entrambi i repo) — nessun codice condiviso, nessun accesso diretto del sito a Firestore. Pattern già rodato e in produzione con tre canali:
1. **Lead: sito → CRM (push, fire-and-forget)** — se il push fallisce, il sito risponde comunque 200 all'utente, errore solo loggato, nessun retry.
2. **Catalogo servizi: CRM → sito (pull, cache ISR 5 minuti)** — il CRM è la fonte di verità, il sito la richiama con cache.
3. **Invalidazione cache: CRM → sito (push)** — quando un admin modifica qualcosa nel CRM, il CRM chiama il sito per invalidare la cache all'istante invece di aspettare la finestra ISR.

**Il modulo eventi estende questo stesso schema, con differenze importanti da rispettare:**

- **Catalogo eventi: CRM → sito (pull, cache)** — stesso pattern del catalogo servizi, riusando `revalidateTag` per aggiornamenti istantanei quando un evento cambia stato (pubblicato, cancellato, ecc.).
- **Creazione checkout: sito → CRM, chiamata sincrona (NON fire-and-forget)** — il sito deve attendere la risposta del CRM per ottenere l'URL di Stripe a cui reindirizzare l'utente. Diverso dal pattern lead: qui non è una notifica, è un dato che serve subito.
- **Webhook Stripe: arriva direttamente al CRM**, non passa dal sito — il CRM è l'unico proprietario del database e ha senso tenere il sito fuori dal passaggio critico del pagamento, indipendentemente dal fatto che un pattern di webhook esista già o sia da costruire ex novo nel CRM (verifica in sospeso, vedi nota dedicata più sotto).
- **Iscrizione mailing list "Tienimi aggiornato": sito → CRM (push, fire-and-forget va bene)** — stesso livello di rischio accettabile dei lead, non è denaro.
- **[CRITICO] La cache a 5 minuti dei servizi è troppo lenta per la disponibilità posti.** La pagina di sfoglia eventi può restare cache-based (stesso `revalidateTag`), ma il momento della prenotazione vera e propria deve verificare la disponibilità posti **in tempo reale sul CRM**, mai fidandosi del dato in cache — altrimenti due persone vedono per minuti lo stesso "ultimo posto disponibile".
- **[CRITICO] Il rate-limiting in-memory attuale (best-effort, si azzera ad ogni redeploy) è pensato per i lead, non basta per il checkout.** Con posti limitati e hold temporanei, un abuso dell'endpoint di creazione checkout potrebbe "occupare" ripetutamente tutti i posti senza mai pagare, bloccando gli acquirenti reali — rischio che i lead non avevano. Serve una protezione più solida, lasciata a Opus da progettare.

**[RISOLTO] Bilingue (IT/EN).** La sezione eventi segue la stessa convenzione del resto del sito (ogni rotta sotto `[locale]`, stessi slug in entrambe le lingue) — coerenza con tutto il resto. Vinifera scriverà titolo/descrizione evento in entrambe le lingue dal CRM; il modello dati Evento ha campi testuali per-lingua, non singoli. Anche le etichette dei badge di stato (Prossimamente, Prenotazioni aperte, ecc.) vanno nei dizionari `it.json`/`en.json` del sito come tutte le altre stringhe visibili, non hardcoded.

**Testing:** il repo del sito non ha oggi alcun test runner configurato (niente Vitest, niente script `test`) — a differenza del CRM. La richiesta di test automatici (vedi sezione dedicata) implica quindi anche inizializzare un test runner nel repo sito, non solo aggiungere test a una suite esistente.

**SEO (suggerimento, non bloccante):** il sito cura molto la SEO (JSON-LD, sitemap, hreflang per ogni pagina, incluso `ProfessionalService` globale e `Service` per pagina). Vale la pena che Opus preveda structured data `Event` (schema.org) per le pagine evento — basso sforzo, alto valore, coerente con quanto già fatto per le pagine servizio.

**[Verifica prima di procedere]** Una versione precedente del CLAUDE.md del CRM elencava "webhooks" tra le categorie di API route già esistenti; la versione rigenerata più recente non li menziona più tra quelle presenti. Prima di assumere che esista già un pattern di webhook consolidato da riusare per Stripe, va verificato se un webhook handler reale esiste davvero nel CRM oggi — se no, è lavoro nuovo (comunque fattibile), non un riuso.

## Scheduler e ricorrenza: pattern esistenti da riusare

Il CRM ha già tre scheduler indipendenti per promemoria/pagamenti/costi. Due sono utili come precedente diretto per il modulo eventi:

- **Ricorrenza eventi**: la Cloud Function `checkReminders` gestisce già la ricorrenza dei promemoria creando l'istanza successiva e chiudendo quella attuale — stesso meccanismo concettuale da riusare per gli eventi ricorrenti, invece di inventarne uno nuovo.
- **Rilascio posti in hold**: `checkReminders` gira **ogni minuto** (Cloud Scheduler), a differenza dei due cron Vercel che girano una volta al giorno — è la sede naturale per la logica di scadenza/rilascio dell'hold sui posti (TTL ~15 minuti), non i cron giornalieri, troppo lenti per questo caso.
- **Attenzione ai secret duplicati**: `RESEND_API_KEY`/`RESEND_FROM_EMAIL` per la Cloud Function sono secret Firebase configurati separatamente da quelli usati dal resto dell'app su Vercel — se la logica di notifica per hold/eventi finisce in quella Cloud Function, il secret va configurato anche lì esplicitamente.

## Modello dati di massima (concettuale, non definitivo)

- **Evento**: titolo e descrizione **per-lingua (IT/EN)**, data/ora, luogo, capienza totale, **limite posti per singolo ordine (opzionale, default nessun limite)**, stato interno (bozza / pubblicato-non prenotabile / prenotabile / sold-out / chiuso / cancellato), flag "in evidenza", immagine/media, prezzo unico + eventuale sconto (riprendendo la logica già esistente nella sezione "Servizi").
- **Ordine**: acquirente collegato (referente), evento, quantità posti, stato (pending/hold, pagato, rimborsato, cancellato), importo totale, riferimento pagamento Stripe.
- **Partecipante** (dettaglio dentro l'ordine, uno per posto acquistato): solo nome e cognome, nessun contatto proprio.
- **Acquirente/Anagrafica**: email, telefono, nome — referente unico dell'ordine, chiave di match per lo storico (almeno uno tra email/telefono deve combaciare).
- **StoricoAcquirente**: derivato da Ordini passati, non una tabella a sé — vista aggregata per anagrafica acquirente.
- **IscrittoAggiornamenti**: email, stato consenso (in attesa conferma / confermato / disiscritto), data iscrizione — alimenta le notifiche "Tienimi aggiornato", indipendente dalle entità Acquirente/Ordine.
- **ProfiloFatturazione** (collegato all'ordine): tipo (privato/azienda) + campi corrispondenti come da sezione dedicata sopra.
- **Pagamento**: log delle transazioni Stripe (per riconciliazione e dashboard entrate).

## Linee guida grafiche

**Coerenza visiva:** i colori di ogni componente nuovo (badge, banner, pulsanti, card) devono essere presi dalla palette già esistente sul sito e sul gestionale di Vinifera, adattandosi allo stile attuale — non introdurre colori nuovi non presenti nel brand.

## Badge di stato evento (lato sito)

Da mostrare sulla card evento, pochi e chiari (mapping dallo stato interno). Colori specifici:

| Badge | Quando | Sfondo | Testo |
|---|---|---|---|
| **Prossimamente** | Evento pubblicato ma prenotazioni non ancora aperte | Oro | Verde Vinifera |
| **Prenotazioni aperte** | Evento prenotabile con posti disponibili | Verde Vinifera | Oro |
| **Posti terminati** | Capienza raggiunta (sold-out) | Rosso vino (come nella presentazione di riferimento) | Bianco |
| **Concluso** | Data evento passata | Grigio | Bianco |

*(Oro, Verde Vinifera, Rosso vino e Grigio devono corrispondere esattamente alle tonalità già in uso sul sito/gestionale, non a colori generici — vedi nota sulla coerenza visiva sopra.)*

**Importante:** questa palette (Oro/Verde Vinifera/Rosso vino/Grigio) vale **solo per i badge di stato evento sul sito pubblico**. Per eventuali badge di stato mostrati dentro il CRM (vista admin), non va riusata questa palette: il CRM ha già una convenzione fissa di colori per gli stati (pending=grigio, in_progress=blu, completed=verde, cancelled=rosso scuro, ecc.) — sta a Opus decidere come mappare gli stati evento su quella convenzione esistente lato CRM, senza mescolarla con la palette del sito.

(Evento "cancellato" probabilmente va solo rimosso/nascosto dal sito invece di avere un badge dedicato — da confermare.)

## Punti critici emersi (bug logici da non ignorare)

1. **[RISOLTO — vedi decisioni sopra] Overbooking / race condition sui posti limitati.** Hold temporaneo del posto durante il checkout con timer visibile all'utente (countdown in tempo reale) e schermata dedicata di scadenza, non un timeout silenzioso. Durata esatta (15 minuti indicativi) da confermare in fase tecnica.
2. **[RISOLTO] Checkout abbandonato.** Timer visibile con TTL (indicativamente 15 minuti, da confermare in fase tecnica) e nessuna waitlist prevista — vedi decisioni sopra.
3. **[RISOLTO] Evento visibile ≠ evento prenotabile.** Coperto dallo stato interno dell'Evento (bozza / pubblicato-non prenotabile / prenotabile / sold-out / chiuso / cancellato) e dai badge di stato lato sito — vedi modello dati e sezione badge.
4. **[RISOLTO] Modifica evento dopo vendite già effettuate.** Bottone "Notifica tutti" in CRM (oggetto e testo liberi via Resend), vedi decisioni sopra.
5. **GDPR sul match storico acquirenti.** Il matching automatico email/telefono tra ordini diversi (sull'acquirente, non sui partecipanti) è di fatto profilazione: va registrato un consenso esplicito con timestamp al momento della prenotazione, non dedotto a posteriori. *(Rischio ridotto rispetto a prima: i partecipanti hanno solo nome/cognome, nessun dato di contatto di terzi da gestire.)*
6. **[RISOLTO] Overbooking su riduzione capienza.** Blocco automatico nuove prenotazioni + alert admin, rimborso manuale uno per uno. Vedi decisioni sopra.
7. **[RISOLTO] Evento in evidenza mostrato quando sold-out/concluso.** Auto-rimozione dal banner quando lo stato non è più "prenotabile".
8. **[RISOLTO] Ruolo acquirente vs partecipanti.** L'acquirente è sempre una figura separata (referente unico, email + telefono); i partecipanti hanno solo nome e cognome, senza contatti propri.
9. **[RISOLTO] Chi viene avvisato in caso di cancellazione/modifica evento.** Solo l'acquirente (i partecipanti non hanno contatti propri nel sistema).


## Punti ancora aperti (da chiudere prima o durante la fase tecnica con Opus)

- **[RISOLTO, per ora] Servizio di fatturazione elettronica: si resta su ricevuta + commercialista a mano.** A-Cube (app Stripe App Marketplace) resta un'opzione valida in futuro, ma accantonata per il pattern d'uso sporadico di Vinifera (eventi anche a distanza di mesi) e per l'incertezza su come si comporta il costo del piano a pagamento nei mesi di inattività — non è chiaro se sia legato solo ai mesi di reale utilizzo o sia un abbonamento fisso da disattivare a mano. La commercialista userà EasyCloudFatt con i dati già pronti nel profilo di fatturazione raccolto in checkout. **Nota:** anche a mano, la fattura si emette per ogni singolo ordine/acquirente, mai una fattura unica per evento che raggruppa acquirenti diversi.
- **[RISOLTO] Dati da raccogliere prima del pagamento.** Vedi sezione "Profilo di fatturazione" sopra: Privato (nome, cognome, CF, indirizzo) o Azienda (ragione sociale, P.IVA, indirizzo sede, SDI/PEC). Da far confermare comunque alla commercialista come ultimo controllo di completezza, ma l'impianto è definito.
- **[Nota tecnica per Opus] Form condizionale Privato/Azienda.** Probabilmente più semplice da gestire come step nel checkout proprietario (prima del redirect a Stripe) piuttosto che con i campi nativi di Stripe Checkout, meno flessibili su logica condizionale — scelta finale lasciata a Opus.
- **[RISOLTO] Backend nel CRM, integrazione REST già rodata** (pattern lead/servizi esistente, esteso per checkout/webhook/catalogo eventi) — vedi sezione Architettura per i dettagli e le differenze rispetto al pattern lead.
- **[Nota tecnica per Opus] Anti-abuso sull'endpoint di checkout**, più solido del rate-limiting in-memory usato oggi per i lead — vedi sezione Architettura.
- **[Nota tecnica per Opus] Disponibilità posti sempre verificata in tempo reale sul CRM al momento della prenotazione**, mai dal dato in cache del catalogo — vedi sezione Architettura.
- **Banner "in evidenza" in home**: impostazione di massima già data (banner non invasivo, non modale full-screen, una volta a sessione) — i dettagli grafici/di interazione restano da definire in fase di design UI.
- **Riuso della UI "Servizi" esistente** per prezzo/sconto: verificare se il componente attuale è già riusabile così com'è per l'evento a prezzo singolo, o va adattato.
- **Dashboard entrate per il cliente**: definire i numeri chiave che Vinifera vuole vedere (es. incasso totale per evento, per periodo, numero partecipanti) — non serve export formale, ma vanno scelte le metriche giuste.

## Test automatici

Per ogni sezione del modulo dove ha senso in termini di costo/beneficio, vanno previsti **test automatici** (unit/integration a seconda del caso) — più copertura c'è, meglio è, con priorità alle parti più delicate: hold/rilascio posti, calcolo posti disponibili, flusso di pagamento e webhook Stripe, rimborsi (automatico e manuale), generazione ricevuta, notifiche via Resend, matching storico acquirenti. Il livello di dettaglio esatto (quali casi testare, quanto in profondità) è lasciato a Opus in base al codice, coerente con la nota generale sui dettagli implementativi già espressa sotto.

## Prossimo step

Passare questo documento a Opus per: definizione schema DB dettagliato, scelta tra Stripe Checkout vs Payment Element, flusso esatto di hold/rilascio posti, modello per eventi ricorrenti, **contratto tra i due repository separati (CRM e sito, vedi sezione dedicata)**, copertura di test automatici (vedi sezione dedicata sopra), e chiusura degli ultimi punti aperti elencati sopra (dati checkout da confermare con la commercialista, dettagli banner e dashboard) prima di iniziare l'esecuzione con Claude Code (Sonnet).

**Nota generale:** per tutti i dettagli implementativi non esplicitamente deciso qui (es. esatta gestione tecnica dell'hold, struttura dati per la ricorrenza, dettagli del rate-limiting sul bottone "Notifica tutti"), lasciamo che sia Opus a proporre la soluzione migliore in base al codice/stack esistente, senza vincolarlo oltre le decisioni di prodotto già prese in questo documento.

# Checklist test manuale — Import AI Spese + Import AI Kit da Offerta

> Eseguire con emulatori Firebase attivi (`npm run emulators`) + app dev (`npm run dev`).

---

## 🧾 Feature: Import spese multi-periodo (bollette)

- [X] **1. Upload immagine JPEG/PNG** nella pagina "Nuova spesa" — il dropzone deve accettare il file
- [X] **2. Upload bolletta con più periodi** — il recap deve mostrare N spese separate, ognuna con la propria data e importo
- [X] **3. Selezione parziale** — deseleziona una spesa nel recap → deve essere esclusa dal batch
- [X] **4. Conferma batch** — verifica in Firestore (emulator UI :4000) che esistano le N spese con lo stesso `pdfStoragePath`
- [X] **5. File troppo grande** — immagine >5 MB o PDF >10 MB → deve rispondere 413 con messaggio leggibile
- [X] **6. Tipo file non valido** (es. `.docx`) — deve essere rifiutato dal dropzone (input accept) e anche lato server

---

## 🧰 Feature: Import kit da offerta

- [X] **7. Bottone "Importa da offerta"** — presente in `/costs/kits` nella KitsTable
- [X] **8. Upload PDF offerta** nel sheet → parsing AI restituisce righe con codice, descrizione, prezzo
- [X] **9. Match automatico analisi** — riga con codice che corrisponde a un'analisi esistente → campo analisi già compilato, badge verde
- [X] **10. Riga senza match** — campo analisi vuoto, blocker visibile, submit disabilitato finché non si assegna un'analisi
- [X] **11. Riga senza `numberOfTests`** (es. formato "125 mL") — blocker `needs_tests`, campo editabile nel recap
- [X] **12. Stessa analisi su due righe** — assegnarla due volte → warning "stessa analisi su più righe", submit bloccato
- [X] **13. Conferma import** — in Firestore: kit creati/aggiornati + spesa `kit_purchase` con `linkedKitIds` corretti
- [X] **14. Conflitto concurrency (409)** — apri il recap in due tab, importa dalla prima → nella seconda clicca "Riprova" → recap si ricarica con dati aggiornati

---

## 📊 Cruscotto costi

- [X] **15. "Di cui kit"** — in `/costs` la card "Spese variabili" mostra "di cui kit: €X,XX" solo se esistono spese `kit_purchase`
- [X] **16. Pricing aggiornato** — in `/costs/pricing` le analisi con kit importati hanno `costPerTestCents` aggiornato

---

## 🔗 Dettaglio spesa

- [X] **17. Sezione "Kit collegati"** — aprendo una spesa `kit_purchase` appare la lista dei kit con link a `/costs/kits`
- [X] **18. Sezione assente su spese normali** — aprendo una spesa di altra categoria la sezione "Kit collegati" non appare

---

## 🛡️ Sicurezza / edge case

- [ ] **19. Accesso non autenticato** a `POST /api/costs/parse-offer` → risposta 401
- [ ] **20. Payload JSON malformato** a `POST /api/costs/import-kit-offer` → risposta 400 con errori Zod

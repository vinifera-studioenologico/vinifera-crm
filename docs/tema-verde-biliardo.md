# Tema light verde biliardo — documento di sviluppo

> **Obiettivo**: sostituire lo sfondo crema/panna del tema chiaro con un verde biliardo,
> mantenendo leggibilità e coerenza con il verde foresta e l'oro champagne del logo.
>
> **Stato**: da implementare. **Fonte**: appunti cliente 20/09/2026, punto #2.

---

## 1. Richiesta del cliente

> *"Sfondo light del CRM, invece di bianco/giallino panna deve essere verde biliardo."*

---

## 2. Stato attuale

Tutti i colori sono token CSS in `src/app/globals.css`. Il tema chiaro è il blocco `:root`
(`:12-37`), quello scuro `.dark` (`:39-62`); `@theme inline` (`:64-89`) li espone a Tailwind v4
come `--color-*`. Il dark mode esiste già via `next-themes`
(`src/providers/theme-provider.tsx`, toggle in `src/components/app-shell/Topbar.tsx:73`).

Token chiari da cambiare oggi:

```css
--background: oklch(0.985 0.005 80);   /* crema — è questo il "giallino panna" */
--card: oklch(1 0 0);                  /* bianco puro */
--popover: oklch(1 0 0);               /* bianco puro */
--secondary: oklch(0.92 0.04 82);      /* neutro caldo, virato oro */
--muted: oklch(0.93 0.01 82);          /* idem */
--muted-foreground: oklch(0.5 0.02 165);
--border: oklch(0.88 0.015 165);
--input: oklch(0.88 0.015 165);
```

`body` prende il colore da `var(--background)` (`:95-102`), quindi cambiare il token è
sufficiente per l'intera app.

**Due sfondi bianchi sono però cablati fuori dai token** e resterebbero bianchi a contrasto
stridente sul verde:

- `src/components/app-shell/Sidebar.tsx:237` — riquadro logo, `bg-white shadow-sm`
- `src/components/app-shell/Sidebar.tsx:254` — logo + wordmark, `bg-white px-2.5 py-1.5`

Gli altri `bg-white`/`#fff` del repo sono dentro email HTML e documenti PDF
(`src/lib/email.ts`, `src/components/pdf/*`, `functions/src/index.ts`): **non vanno toccati**,
non c'entrano col tema dell'app.

---

## 3. Decisione tecnica — due varianti, si parte dalla chiara

"Verde biliardo" letterale è un verde profondo e saturo (tipo `#0a5c36`). Usato come **sfondo
pagina di un tema chiaro** renderebbe il testo scuro poco leggibile e di fatto trasformerebbe il
light in un secondo dark: per un gestionale denso di tabelle non regge.

La lettura adottata è: **il tema chiaro resta chiaro, ma la base passa da crema a verde**, con le
card più chiare sopra a dare profondità. È la variante A.

La variante B è pronta qui sotto se il cliente, vedendola a video, la vuole più marcata: si
cambiano gli stessi token, niente altro. **Vedi punto aperto §6.**

### Variante A — verde salvia (default da implementare)

```css
:root {
  /* Base verde biliardo chiara — armonizza con il verde foresta del logo */
  --background: oklch(0.945 0.022 165);
  --foreground: oklch(0.15 0.02 175);
  --card: oklch(0.985 0.008 165);
  --card-foreground: oklch(0.15 0.02 175);
  --popover: oklch(0.985 0.008 165);
  --popover-foreground: oklch(0.15 0.02 175);
  /* Primary — forest green from logo (invariato) */
  --primary: oklch(0.37 0.09 175);
  --primary-foreground: oklch(0.98 0.005 80);
  /* Secondary — verde desaturato, non più oro */
  --secondary: oklch(0.90 0.03 168);
  --secondary-foreground: oklch(0.2 0.03 175);
  --muted: oklch(0.91 0.02 165);
  --muted-foreground: oklch(0.47 0.025 165);
  /* Accent — champagne gold from logo (invariato: è l'accento del brand) */
  --accent: oklch(0.88 0.07 82);
  --accent-foreground: oklch(0.25 0.05 82);
  --destructive: oklch(0.45 0.15 20);
  --destructive-foreground: oklch(0.98 0.005 80);
  --border: oklch(0.86 0.02 165);
  --input: oklch(0.86 0.02 165);
  --ring: oklch(0.37 0.09 175);
  --radius: 0.75rem;
}
```

### Variante B — verde feltro (solo se richiesta dopo la revisione)

Rispetto alla A cambiano sei valori, il resto identico:

```css
  --background: oklch(0.88 0.045 165);
  --card: oklch(0.975 0.012 165);
  --popover: oklch(0.975 0.012 165);
  --muted: oklch(0.855 0.035 165);
  --border: oklch(0.79 0.04 165);
  --input: oklch(0.79 0.04 165);
```

**Il blocco `.dark` non va toccato**: è già "deep forest", coerente con la richiesta.

---

## 4. Implementazione

1. `src/app/globals.css` — sostituire il blocco `:root` (`:12-37`) con la **variante A** di §3.
   Mantenere i commenti, aggiornandoli dove non descrivono più il colore (il commento
   `/* Warm cream base ... */` va riscritto).
2. `src/components/app-shell/Sidebar.tsx:237` — `bg-white` → `bg-card`.
3. `src/components/app-shell/Sidebar.tsx:254` — `bg-white` → `bg-card`.
4. Nessun altro file. In particolare **non** toccare `src/lib/email.ts`,
   `src/components/pdf/*`, `functions/src/index.ts`, `src/app/api/auth/password-reset/route.ts`:
   sono template email/PDF, il loro bianco è corretto.

---

## 5. Criteri di accettazione

Da verificare **a schermo con l'app in esecuzione** (`npm run dev`), non solo a codice:

- [ ] In tema chiaro lo sfondo pagina è visibilmente verde, non crema né bianco.
- [ ] Le card e le tabelle restano più chiare dello sfondo e si distinguono senza sforzo.
- [ ] Il riquadro del logo in sidebar non è più un rettangolo bianco stridente.
- [ ] Testo normale e testo `text-muted-foreground` restano leggibili sopra sfondo e card.
- [ ] I badge di stato (pending grigio, in_progress blu, completed verde, overdue ambra/rosso…)
      restano distinguibili sul nuovo sfondo — in particolare **completed verde su sfondo verde**:
      se si confonde, va segnalato prima di inventare un colore nuovo.
- [ ] Il tema **scuro** è identico a prima (nessuna regressione).
- [ ] Il toggle chiaro/scuro in Topbar funziona in entrambe le direzioni.
- [ ] Controllare almeno: dashboard, lista campioni, dettaglio cliente, una tabella con righe
      alternate, un Dialog e uno Sheet aperti (usano `--popover`/`--card`).
- [ ] `npm run check` verde.

---

## 6. Punto aperto

**Quale delle due varianti.** Va mostrata la A a video al cliente. Se la vuole "più verde", si
applica la B: sono sei valori nello stesso blocco, nessun'altra modifica. Non inventare una terza
tonalità senza avergliela fatta vedere.

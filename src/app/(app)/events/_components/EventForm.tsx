"use client";

import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

import type { EventDoc } from "@/schemas/event";
import { createEvent, updateEvent, deleteEventImage } from "@/server/actions/events";
import { storage } from "@/lib/firebase/client";
import { toCents, fromCents } from "@/lib/utils/money";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ── Schema piatto per React Hook Form ────────────────────────────────
const EventClientSchema = z.object({
  slug: z
    .string()
    .min(1, "Obbligatorio")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Solo minuscole, numeri, trattini"),

  title_it: z.string().min(1, "Obbligatorio"),
  title_en: z.string(),
  summary_it: z.string().min(1, "Obbligatorio"),
  summary_en: z.string(),
  description_it: z.string(),
  description_en: z.string(),

  previewImageUrl: z.union([z.literal(""), z.string().url("URL non valido")]),
  imageUrl: z.union([z.literal(""), z.string().url("URL non valido")]),

  location_name: z.string().min(1, "Obbligatorio"),
  location_address: z.string(),
  location_city: z.string().min(1, "Obbligatorio"),

  startsAt: z.string().min(1, "Obbligatorio"),
  endsAt: z.string(),
  bookingOpensAt: z.string(),
  bookingClosesAt: z.string(),

  capacity: z.string().min(1, "Obbligatorio"),
  maxSeatsPerOrder: z.string(),

  isFree: z.boolean(),
  // Prezzi in euro (input utente) — convertiti in centesimi al submit
  priceEur: z.string(),
  discountedPriceEur: z.string(),

  featured: z.boolean(),
});

type FormInput = z.infer<typeof EventClientSchema>;

// ── Helper: Timestamp/ISO → "YYYY-MM-DDTHH:mm" ────────────────────
function toDatetimeLocal(ts: unknown): string {
  if (!ts) return "";
  const d =
    typeof ts === "object" && ts !== null && "toDate" in ts
      ? (ts as { toDate: () => Date }).toDate()
      : new Date(ts as string);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toFormValues(doc?: EventDoc): FormInput {
  const isFree = (doc?.priceCents ?? 50) === 0;
  return {
    slug: doc?.slug ?? "",
    title_it: doc?.title?.it ?? "",
    title_en: doc?.title?.en ?? "",
    summary_it: doc?.summary?.it ?? "",
    summary_en: doc?.summary?.en ?? "",
    description_it: doc?.description?.it ?? "",
    description_en: doc?.description?.en ?? "",
    previewImageUrl: doc?.previewImageUrl ?? "",
    imageUrl: doc?.imageUrl ?? "",
    location_name: doc?.location?.name ?? "",
    location_address: doc?.location?.address ?? "",
    location_city: doc?.location?.city ?? "",
    startsAt: toDatetimeLocal(doc?.startsAt),
    endsAt: toDatetimeLocal(doc?.endsAt),
    bookingOpensAt: toDatetimeLocal(doc?.bookingOpensAt),
    bookingClosesAt: toDatetimeLocal(doc?.bookingClosesAt),
    capacity: String(doc?.capacity ?? 20),
    maxSeatsPerOrder: doc?.maxSeatsPerOrder != null ? String(doc.maxSeatsPerOrder) : "",
    isFree,
    priceEur: isFree ? "" : doc?.priceCents != null ? String(fromCents(doc.priceCents)) : "",
    discountedPriceEur:
      doc?.discountedPriceCents != null ? String(fromCents(doc.discountedPriceCents)) : "",
    featured: doc?.featured ?? false,
  };
}

function toServerPayload(values: FormInput) {
  const isFree = values.isFree;
  const priceEurNum = parseFloat(values.priceEur.replace(",", ".")) || 0;
  const discountedEurNum =
    values.discountedPriceEur !== ""
      ? parseFloat(values.discountedPriceEur.replace(",", "."))
      : null;

  return {
    slug: values.slug,
    title: { it: values.title_it, en: values.title_en },
    summary: { it: values.summary_it, en: values.summary_en },
    description: { it: values.description_it, en: values.description_en },
    previewImageUrl: values.previewImageUrl,
    imageUrl: values.imageUrl,
    images: [],
    location: {
      name: values.location_name,
      address: values.location_address,
      city: values.location_city,
    },
    startsAt: values.startsAt,
    endsAt: values.endsAt || null,
    bookingOpensAt: values.bookingOpensAt || null,
    bookingClosesAt: values.bookingClosesAt || null,
    capacity: parseInt(values.capacity, 10) || 1,
    maxSeatsPerOrder:
      values.maxSeatsPerOrder !== "" ? parseInt(values.maxSeatsPerOrder, 10) : null,
    priceCents: isFree ? 0 : toCents(priceEurNum),
    discountedPriceCents:
      !isFree && discountedEurNum !== null ? toCents(discountedEurNum) : null,
    featured: values.featured,
    recurrence: null,
  };
}

interface Props {
  existing?: EventDoc;
  onSuccess?: (id: string) => void;
}

export function EventForm({ existing, onSuccess }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [overbookingWarning, setOverbookingWarning] = useState<{
    excess: number;
  } | null>(null);
  const previewFileInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPreview, setUploadingPreview] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const form = useForm<FormInput>({
    resolver: zodResolver(EventClientSchema),
    defaultValues: toFormValues(existing),
  });

  const isFree = form.watch("isFree");

  function onSubmit(values: FormInput) {
    startTransition(async () => {
      setOverbookingWarning(null);
      const payload = toServerPayload(values);

      try {
        if (existing) {
          const result = await updateEvent(existing.id, payload, existing.version);
          if (!result.success) {
            toast.error(result.error);
            if (result.fieldErrors) {
              for (const [path, msgs] of Object.entries(result.fieldErrors)) {
                form.setError(path as keyof FormInput, { message: msgs[0] });
              }
            }
            return;
          }
          if (result.data.warning === "overbooked") {
            setOverbookingWarning({ excess: result.data.excess ?? 0 });
          }
          toast.success("Evento aggiornato");
          router.refresh();
          onSuccess?.(existing.id);
        } else {
          const result = await createEvent(payload);
          if (!result.success) {
            toast.error(result.error);
            if (result.fieldErrors) {
              for (const [path, msgs] of Object.entries(result.fieldErrors)) {
                form.setError(path as keyof FormInput, { message: msgs[0] });
              }
            }
            return;
          }
          toast.success("Evento creato");
          router.push(`/events/${result.data.id}`);
          onSuccess?.(result.data.id);
        }
      } catch {
        toast.error("Errore imprevisto durante il salvataggio. Riprova.");
      }
    });
  }

  // Upload diretto browser → Firebase Storage (bypassa il limite di body size
  // delle Vercel Serverless Functions, che bloccherebbe file oltre ~4.5MB
  // se passassero per una Server Action). Il limite qui deve restare
  // allineato a quello imposto in storage.rules (20MB).
  const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

  async function handleImageUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    slot: "preview" | "cover",
  ) {
    const file = e.target.files?.[0];
    if (!file || !existing) return;
    const setUploading = slot === "preview" ? setUploadingPreview : setUploadingCover;
    const field = slot === "preview" ? "previewImageUrl" : "imageUrl";
    const fileInputRef = slot === "preview" ? previewFileInputRef : coverFileInputRef;

    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(
        `L'immagine non può superare 20MB (file selezionato: ${(file.size / (1024 * 1024)).toFixed(1)}MB)`,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const objRef = storageRef(storage, `events/${existing.id}/${slot}.${ext}`);
      await uploadBytes(objRef, file, {
        contentType: file.type,
        cacheControl: "public, max-age=31536000",
      });
      const url = await getDownloadURL(objRef);
      form.setValue(field, url);
      toast.success("Immagine caricata");
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error(`Errore durante il caricamento: ${detail}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleImageDelete(slot: "preview" | "cover") {
    if (!existing) return;
    const field = slot === "preview" ? "previewImageUrl" : "imageUrl";
    try {
      const result = await deleteEventImage(existing.id, slot);
      if (result.success) {
        form.setValue(field, "");
        toast.success("Immagine rimossa");
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Errore imprevisto durante la rimozione. Riprova.");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

        {/* Overbooking warning */}
        {overbookingWarning && (
          <Alert variant="destructive">
            <AlertDescription>
              ⚠️ La capienza è stata ridotta sotto i posti già occupati (+{overbookingWarning.excess} in eccedenza).
              Le nuove prenotazioni sono bloccate automaticamente. È stata inviata una notifica all&apos;admin.
            </AlertDescription>
          </Alert>
        )}

        {/* ── Dati principali ── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Dati principali
          </h2>

          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Slug *</FormLabel>
                <FormControl>
                  <Input placeholder="degustazione-vini-2026" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="title_it"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titolo IT *</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="title_en"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titolo EN</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="summary_it"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sommario IT *</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="summary_en"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sommario EN</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="description_it"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrizione IT</FormLabel>
                  <FormControl>
                    <Textarea rows={4} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description_en"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrizione EN</FormLabel>
                  <FormControl>
                    <Textarea rows={4} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        {/* ── Luogo ── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Luogo
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="location_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome luogo *</FormLabel>
                  <FormControl>
                    <Input placeholder="Cantina Vinifera" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Indirizzo</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location_city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Città *</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        {/* ── Date ── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Date
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="startsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Inizio evento *</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fine evento</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="bookingOpensAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Apertura prenotazioni</FormLabel>
                  <FormDescription className="text-xs">
                    Lascia vuoto = prenotabile subito dopo la pubblicazione
                  </FormDescription>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="bookingClosesAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chiusura prenotazioni</FormLabel>
                  <FormDescription className="text-xs">
                    Lascia vuoto = fino all&apos;inizio evento
                  </FormDescription>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        {/* ── Capienza e prezzi ── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Capienza e prezzi
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Capacità massima *</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="maxSeatsPerOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Posti massimi per ogni prenotazione{isFree ? " *" : ""}
                  </FormLabel>
                  {isFree && (
                    <FormDescription className="text-xs text-amber-600 dark:text-amber-400">
                      Per gli eventi gratuiti è obbligatorio impostare un limite di posti per ordine,
                      a tutela da prenotazioni eccessive.
                    </FormDescription>
                  )}
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      placeholder={isFree ? "Es. 4" : "Nessun limite"}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Switch evento gratuito */}
          <FormField
            control={form.control}
            name="isFree"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={(v) => {
                      field.onChange(v);
                      if (v) {
                        form.setValue("priceEur", "");
                        form.setValue("discountedPriceEur", "");
                      }
                    }}
                  />
                </FormControl>
                <Label className="cursor-pointer">Evento gratuito</Label>
              </FormItem>
            )}
          />

          {!isFree && (
            <div className="grid md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="priceEur"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prezzo (€) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0.5}
                        step={0.01}
                        placeholder="30.00"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="discountedPriceEur"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prezzo scontato (€)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0.5} step={0.01} placeholder="—" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </section>

        {/* ── Immagini ── */}
        <section className="space-y-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Immagini
          </h2>

          {/* Campi nascosti — popolati dall'upload, non editabili manualmente */}
          <input type="hidden" {...form.register("previewImageUrl")} />
          <input type="hidden" {...form.register("imageUrl")} />

          {/* Immagine anteprima (elenco eventi + widget promo) */}
          <div className="space-y-2">
            <Label>Immagine anteprima</Label>
            <p className="text-xs text-muted-foreground">
              Usata nella card dell&apos;elenco eventi e nel widget di promozione. Formato{" "}
              <strong>4:3</strong> (es. 1200×900px), file PNG/JPEG/WebP, max 20MB.
            </p>

            {existing ? (
              <div className="flex items-center gap-3">
                <input
                  ref={previewFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => handleImageUpload(e, "preview")}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => previewFileInputRef.current?.click()}
                  disabled={uploadingPreview}
                >
                  {uploadingPreview ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                  {form.watch("previewImageUrl") ? "Sostituisci immagine" : "Carica immagine"}
                </Button>
                {form.watch("previewImageUrl") && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleImageDelete("preview")}
                  >
                    Rimuovi
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Salva prima l&apos;evento in bozza, poi potrai caricare l&apos;immagine dalla pagina di dettaglio.
              </p>
            )}

            {form.watch("previewImageUrl") && (
              <div className="relative w-full max-w-sm aspect-4/3 border rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.watch("previewImageUrl")}
                  alt="Anteprima"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>

          {/* Immagine copertina (hero pagina dettaglio evento) */}
          <div className="space-y-2">
            <Label>Immagine copertina</Label>
            <p className="text-xs text-muted-foreground">
              Usata come banner nella pagina di dettaglio dell&apos;evento. Formato{" "}
              <strong>16:7</strong> (es. 1600×700px), file PNG/JPEG/WebP, max 20MB.
            </p>

            {existing ? (
              <div className="flex items-center gap-3">
                <input
                  ref={coverFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => handleImageUpload(e, "cover")}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => coverFileInputRef.current?.click()}
                  disabled={uploadingCover}
                >
                  {uploadingCover ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                  {form.watch("imageUrl") ? "Sostituisci immagine" : "Carica immagine"}
                </Button>
                {form.watch("imageUrl") && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleImageDelete("cover")}
                  >
                    Rimuovi
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Salva prima l&apos;evento in bozza, poi potrai caricare l&apos;immagine dalla pagina di dettaglio.
              </p>
            )}

            {form.watch("imageUrl") && (
              <div className="relative w-full max-w-sm aspect-16/7 border rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.watch("imageUrl")}
                  alt="Copertina"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        </section>

        {/* ── Opzioni ── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Opzioni
          </h2>
          <FormField
            control={form.control}
            name="featured"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <Label className="cursor-pointer">In evidenza (banner home)</Label>
              </FormItem>
            )}
          />
        </section>

        {/* ── Submit ── */}
        <div className="flex gap-3 justify-end pt-4 border-t border-border">
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {existing ? "Salva modifiche" : "Crea evento"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

"use client";

import { useTransition, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Upload, Building2, ImageIcon } from "lucide-react";

import { CompanySettingsSchema } from "@/schemas/client";
import type { CompanySettingsValues } from "@/schemas/client";
import { updateCompanySettings, uploadCompanyLogo, uploadWatermarkImage } from "@/server/actions/settings";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  defaultValues?: Partial<CompanySettingsValues>;
}

export function CompanySettingsForm({ defaultValues }: Props) {
  const [isPending, startTransition] = useTransition();
  const [isUploading, startUpload] = useTransition();
  const [isUploadingWm, startUploadWm] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wmFileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<CompanySettingsValues>({
    resolver: zodResolver(CompanySettingsSchema),
    defaultValues: {
      legalName: "",
      displayName: "",
      vatNumber: "",
      taxCode: "",
      email: "",
      phone: "",
      pec: "",
      iban: "",
      bankName: "",
      logoUrl: "",
      defaultEnpaiaPercent: 4,
      defaultVatPercent: 22,
      defaultEnpaiaApplied: true,
      quoteFooterNote: "",
      reportFooterNote: "",
      quoteFiscalNote: "",
      quoteConditions: "",
      quotePrivacyNote: "",
      quoteAcceptanceText: "",
      watermarkEnabled: false,
      watermarkUrl: "",
      watermarkRotation: -45,
      quoteFontSize: "md",
      address: {
        street: "",
        city: "",
        zip: "",
        province: "",
        country: "Italia",
      },
      ...defaultValues,
    },
  });

  function onSubmit(values: CompanySettingsValues) {
    startTransition(async () => {
      const result = await updateCompanySettings(values);
      if (result.success) {
        toast.success("Impostazioni salvate con successo");
      } else {
        toast.error(result.error);
        // Mostra errori per campo se disponibili
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            form.setError(field as keyof CompanySettingsValues, {
              message: (messages as string[])[0],
            });
          }
        }
      }
    });
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    startUpload(async () => {
      const fd = new FormData();
      fd.append("logo", file);
      const result = await uploadCompanyLogo(fd);
      if (result.success) {
        form.setValue("logoUrl", result.data.logoUrl);
        toast.success("Logo caricato con successo");
      } else {
        toast.error(result.error);
      }
    });
  }

  const logoUrl = useWatch({ control: form.control, name: "logoUrl" });
  const watermarkUrl = useWatch({ control: form.control, name: "watermarkUrl" });
  const watermarkEnabled = useWatch({ control: form.control, name: "watermarkEnabled" });

  function handleWatermarkChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    startUploadWm(async () => {
      const fd = new FormData();
      fd.append("watermark", file);
      const result = await uploadWatermarkImage(fd);
      if (result.success) {
        form.setValue("watermarkUrl", result.data.watermarkUrl);
        toast.success("Filigrana caricata con successo");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

        {/* ── Sezione Logo ─────────────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Logo aziendale</h2>
            <p className="text-xs text-muted-foreground">
              Usato nell&apos;intestazione dei PDF. PNG, JPEG, WebP o SVG, max 2MB.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-xl border border-border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Logo aziendale"
                  className="size-full object-contain"
                />
              ) : (
                <Building2 className="size-6 text-muted-foreground/50" strokeWidth={1.5} />
              )}
            </div>
            <div className="space-y-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" strokeWidth={1.75} />
                )}
                {isUploading ? "Caricamento..." : "Carica logo"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Il logo sostituisce quello precedente
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleLogoChange}
            />
          </div>
        </section>

        <Separator />

        {/* ── Dati azienda ────────────────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Dati aziendali</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="legalName"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Ragione sociale *</FormLabel>
                  <FormControl>
                    <Input placeholder="Laboratorio Enologico Srl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome breve *</FormLabel>
                  <FormControl>
                    <Input placeholder="Vinifera Lab" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="vatNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>P.IVA *</FormLabel>
                  <FormControl>
                    <Input placeholder="12345678901" maxLength={11} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="taxCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Codice Fiscale</FormLabel>
                  <FormControl>
                    <Input placeholder="RSSMRA85T10A562S" maxLength={16} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="info@laboratorio.it" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefono *</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="+39 0123 456789" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="pec"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PEC</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="laboratorio@pec.it" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        <Separator />

        {/* ── Indirizzo ────────────────────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Indirizzo</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="address.street"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Via / Piazza</FormLabel>
                  <FormControl>
                    <Input placeholder="Via Roma, 1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address.city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Città</FormLabel>
                  <FormControl>
                    <Input placeholder="Milano" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="address.zip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CAP</FormLabel>
                    <FormControl>
                      <Input placeholder="20100" maxLength={5} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address.province"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prov.</FormLabel>
                    <FormControl>
                      <Input placeholder="MI" maxLength={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="address.country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paese</FormLabel>
                  <FormControl>
                    <Input placeholder="Italia" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        <Separator />

        {/* ── Banca & Pagamenti ────────────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Dati bancari</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="iban"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>IBAN</FormLabel>
                  <FormControl>
                    <Input placeholder="IT60X0542811101000000123456" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="bankName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Istituto bancario</FormLabel>
                  <FormControl>
                    <Input placeholder="Intesa Sanpaolo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        <Separator />

        {/* ── Defaults PDF / Fiscali ───────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Default preventivi</h2>
            <p className="text-xs text-muted-foreground">
              Valori precompilati nei nuovi preventivi (modificabili voce per voce).
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="defaultEnpaiaPercent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>% Enpaia default</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="defaultVatPercent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>% IVA default</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="defaultEnpaiaApplied"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm">Enpaia applicata di default</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Pre-seleziona Enpaia nei nuovi preventivi
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </section>

        <Separator />

        {/* ── Note PDF ─────────────────────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Note footer PDF</h2>
          <FormField
            control={form.control}
            name="quoteFooterNote"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Footer preventivo</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Nota legale da mostrare nel footer del PDF preventivo"
                    rows={3}
                    className="resize-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="reportFooterNote"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Footer referto</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Es. Laboratorio accreditato Accredia n. 1234"
                    rows={3}
                    className="resize-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <Separator />

        {/* ── Testi personalizzati PDF preventivo ──────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Testi PDF preventivo</h2>
            <p className="text-xs text-muted-foreground">
              Testi legali e condizioni stampati nel PDF dei preventivi.
              Se lasciati vuoti, vengono usati quelli predefiniti.
            </p>
          </div>
          <FormField
            control={form.control}
            name="quoteFiscalNote"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nota fiscale e previdenziale</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Es. Operazione senza applicazione dell'IVA ai sensi dell'art. 1, commi 54-89, L. 190/2014..."
                    rows={5}
                    className="resize-y"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="quoteConditions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Condizioni generali</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={"1. VALIDITÀ DEL PREVENTIVO\nIl presente preventivo ha validità 30 giorni...\n\n2. AVVIO DELLE ATTIVITÀ\n..."}
                    rows={10}
                    className="resize-y"
                    {...field}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Separa gli articoli con una riga vuota. La prima riga di ogni blocco diventa il titolo.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="quotePrivacyNote"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trattamento dati e privacy</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Qualora l'esecuzione del servizio comporti il trattamento di dati personali..."
                    rows={4}
                    className="resize-y"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="quoteAcceptanceText"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Clausola di accettazione</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Il committente, con la firma del presente documento, dichiara di accettare..."
                    rows={4}
                    className="resize-y"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <Separator />

        {/* ── Filigrana PDF ────────────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Filigrana PDF</h2>
            <p className="text-xs text-muted-foreground">
              Immagine sovrapposta in trasparenza su ogni pagina dei PDF.
              Se non carichi un&apos;immagine dedicata, viene usato il logo aziendale.
            </p>
          </div>
          <FormField
            control={form.control}
            name="watermarkEnabled"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Abilita filigrana</FormLabel>
                  <p className="text-xs text-muted-foreground">
                    Mostra la filigrana su tutti i PDF generati
                  </p>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          {watermarkEnabled && (
            <>
              <div className="flex items-center gap-4">
                <div className="size-16 rounded-xl border border-border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {watermarkUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={watermarkUrl}
                      alt="Filigrana"
                      className="size-full object-contain"
                    />
                  ) : (
                    <ImageIcon className="size-6 text-muted-foreground/50" strokeWidth={1.5} />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isUploadingWm}
                    onClick={() => wmFileInputRef.current?.click()}
                  >
                    {isUploadingWm ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Upload className="size-3.5" strokeWidth={1.75} />
                    )}
                    {isUploadingWm ? "Caricamento..." : "Carica filigrana"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    PNG, JPEG, WebP o SVG, max 2MB. Se vuoto, usa il logo.
                  </p>
                </div>
                <input
                  ref={wmFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={handleWatermarkChange}
                />
              </div>
              <FormField
                control={form.control}
                name="watermarkRotation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Angolo di rotazione</FormLabel>
                    <Select
                      value={String(field.value ?? -45)}
                      onValueChange={(v) => field.onChange(Number(v))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0">0° (orizzontale)</SelectItem>
                        <SelectItem value="-15">-15°</SelectItem>
                        <SelectItem value="-30">-30°</SelectItem>
                        <SelectItem value="-45">-45° (diagonale)</SelectItem>
                        <SelectItem value="-60">-60°</SelectItem>
                        <SelectItem value="-90">-90° (verticale)</SelectItem>
                        <SelectItem value="15">+15°</SelectItem>
                        <SelectItem value="30">+30°</SelectItem>
                        <SelectItem value="45">+45°</SelectItem>
                        <SelectItem value="60">+60°</SelectItem>
                        <SelectItem value="90">+90° (verticale)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Rotazione dell&apos;immagine filigrana nel PDF
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}
        </section>

        <Separator />

        {/* ── Dimensione font PDF preventivo ───────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Dimensione testo PDF</h2>
            <p className="text-xs text-muted-foreground">
              Dimensione base del carattere nei PDF dei preventivi.
            </p>
          </div>
          <FormField
            control={form.control}
            name="quoteFontSize"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dimensione carattere</FormLabel>
                <Select
                  value={field.value ?? "md"}
                  onValueChange={field.onChange}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="sm">Piccolo</SelectItem>
                    <SelectItem value="md">Medio (predefinito)</SelectItem>
                    <SelectItem value="lg">Grande</SelectItem>
                    <SelectItem value="xl">Molto grande</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        {/* ── Azioni ───────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset()}
            disabled={isPending || !form.formState.isDirty}
          >
            Annulla modifiche
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isPending ? "Salvataggio..." : "Salva impostazioni"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

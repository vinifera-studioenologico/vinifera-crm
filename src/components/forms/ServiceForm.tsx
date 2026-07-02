"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

import type { ServiceDoc } from "@/schemas/service";
import { createService, updateService, uploadServiceImage, deleteServiceImage } from "@/server/actions/services";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

// Flat schema � no nested dynamic paths; avoids react-hook-form generic issues
const ServiceClientSchema = z.object({
  slug: z.string().min(1, "Obbligatorio").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Solo minuscole, numeri, trattini"),
  order: z.string(),
  inEvidenza: z.boolean(),
  available: z.boolean(),
  title_it: z.string().min(1, "Obbligatorio"),
  title_en: z.string(),
  summary_it: z.string().min(1, "Obbligatorio"),
  summary_en: z.string(),
  description_it: z.string().min(1, "Obbligatorio"),
  description_en: z.string(),
  benefits_it: z.array(z.object({ value: z.string().min(1) })),
  benefits_en: z.array(z.object({ value: z.string() })),
  faq_it: z.array(z.object({ q: z.string().min(1), a: z.string().min(1) })),
  faq_en: z.array(z.object({ q: z.string(), a: z.string() })),
  imageUrl: z.union([z.literal(""), z.string().url("URL non valido")]),
  images: z.array(z.object({ url: z.string().url("URL non valido") })),
  basePrice: z.string(),
  discountedPrice: z.string(),
  priceLabel_it: z.string(),
  priceLabel_en: z.string(),
});

type FormInput = z.infer<typeof ServiceClientSchema>;

function toFormValues(doc?: ServiceDoc): FormInput {
  return {
    slug: doc?.slug ?? "",
    order: String(doc?.order ?? 0),
    inEvidenza: doc?.inEvidenza ?? false,
    available: doc?.available ?? true,
    title_it: doc?.title?.it ?? "",
    title_en: doc?.title?.en ?? "",
    summary_it: doc?.summary?.it ?? "",
    summary_en: doc?.summary?.en ?? "",
    description_it: doc?.description?.it ?? "",
    description_en: doc?.description?.en ?? "",
    benefits_it: (doc?.benefits?.it?.length ? doc.benefits.it : [""]).map((v) => ({ value: v })),
    benefits_en: (doc?.benefits?.en ?? []).map((v) => ({ value: v })),
    faq_it: doc?.faq?.it?.length ? doc.faq.it : [{ q: "", a: "" }],
    faq_en: doc?.faq?.en ?? [],
    imageUrl: doc?.imageUrl ?? "",
    images: (doc?.images ?? []).map((url) => ({ url })),
    basePrice: doc?.basePrice != null ? String(doc.basePrice) : "",
    discountedPrice: doc?.discountedPrice != null ? String(doc.discountedPrice) : "",
    priceLabel_it: doc?.priceLabel?.it ?? "",
    priceLabel_en: doc?.priceLabel?.en ?? "",
  };
}

function toServerPayload(values: FormInput) {
  const hasLabel = values.priceLabel_it || values.priceLabel_en;
  return {
    slug: values.slug,
    order: Number(values.order) || 0,
    inEvidenza: values.inEvidenza,
    available: values.available,
    title: { it: values.title_it, en: values.title_en },
    summary: { it: values.summary_it, en: values.summary_en },
    description: { it: values.description_it, en: values.description_en },
    benefits: {
      it: values.benefits_it.map((b) => b.value),
      en: values.benefits_en.map((b) => b.value).filter((v) => v.trim() !== ""),
    },
    faq: {
      it: values.faq_it,
      en: values.faq_en.filter((f) => f.q.trim() !== "" || f.a.trim() !== ""),
    },
    imageUrl: values.imageUrl,
    images: values.images.map((i) => i.url),
    basePrice: values.basePrice !== "" ? Number(values.basePrice) : null,
    discountedPrice: values.discountedPrice !== "" ? Number(values.discountedPrice) : null,
    priceLabel: hasLabel ? { it: values.priceLabel_it, en: values.priceLabel_en } : null,
  };
}

interface Props {
  existing?: ServiceDoc;
  onSuccess?: () => void;
}

export function ServiceForm({ existing, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormInput>({
    resolver: zodResolver(ServiceClientSchema),
    defaultValues: toFormValues(existing),
  });

  const benefitsIt = useFieldArray({ control: form.control, name: "benefits_it" });
  const benefitsEn = useFieldArray({ control: form.control, name: "benefits_en" });
  const faqIt = useFieldArray({ control: form.control, name: "faq_it" });
  const faqEn = useFieldArray({ control: form.control, name: "faq_en" });
  const images = useFieldArray({ control: form.control, name: "images" });

  function onSubmit() {
    const payload = toServerPayload(form.getValues());
    startTransition(async () => {
      const result = existing
        ? await updateService(existing.id, payload, existing.version)
        : await createService(payload);

      if (result.success) {
        toast.success(existing ? "Servizio aggiornato" : "Servizio creato");
        onSuccess?.();
      } else {
        toast.error(result.error);
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            form.setError(field as keyof FormInput, { message: (messages as string[])[0] });
          }
        }
      }
    });
  }

  async function handleCoverUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !existing) return;
    setIsUploading(true);
    const fd = new FormData();
    fd.append("image", file);
    const result = await uploadServiceImage(existing.id, fd, "cover");
    if (result.success) {
      form.setValue("imageUrl", result.data.url);
      toast.success("Immagine caricata");
    } else {
      toast.error(result.error);
    }
    setIsUploading(false);
    e.target.value = "";
  }

  async function handleGalleryUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !existing) return;
    setIsUploading(true);
    const slot = `gallery-${images.fields.length}`;
    const fd = new FormData();
    fd.append("image", file);
    const result = await uploadServiceImage(existing.id, fd, slot);
    if (result.success) {
      images.append({ url: result.data.url });
      toast.success("Immagine aggiunta");
    } else {
      toast.error(result.error);
    }
    setIsUploading(false);
    e.target.value = "";
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        <Tabs defaultValue="it">
          <TabsList variant="line" className="mb-6">
            <TabsTrigger value="it" className="data-active:text-primary px-3">IT</TabsTrigger>
            <TabsTrigger value="en" className="data-active:text-primary px-3">EN</TabsTrigger>
          </TabsList>

          {/* -- IT --------------------------------------------- */}
          <TabsContent value="it" className="space-y-4">
            <FormField control={form.control} name="title_it" render={({ field }) => (
              <FormItem><FormLabel>Titolo *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="summary_it" render={({ field }) => (
              <FormItem><FormLabel>Tagline *</FormLabel><FormControl><Input {...field} maxLength={120} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="description_it" render={({ field }) => (
              <FormItem><FormLabel>Descrizione *</FormLabel><FormControl><Textarea {...field} rows={4} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="space-y-2">
              <Label>Benefici</Label>
              {benefitsIt.fields.map((item, idx) => (
                <div key={item.id} className="flex gap-2">
                  <FormField control={form.control} name={`benefits_it.${idx}.value`} render={({ field }) => (
                    <FormItem className="flex-1"><FormControl><Input placeholder={`Beneficio ${idx + 1}`} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => benefitsIt.remove(idx)}><Trash2 className="size-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => benefitsIt.append({ value: "" })}>
                <Plus className="size-3.5 mr-1" /> Aggiungi punto
              </Button>
            </div>
            <div className="space-y-3">
              <Label>FAQ</Label>
              {faqIt.fields.map((item, idx) => (
                <div key={item.id} className="space-y-2 border rounded-md p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-muted-foreground">FAQ {idx + 1}</span>
                    <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => faqIt.remove(idx)}><Trash2 className="size-3" /></Button>
                  </div>
                  <FormField control={form.control} name={`faq_it.${idx}.q`} render={({ field }) => (
                    <FormItem><FormLabel className="text-xs">Domanda</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name={`faq_it.${idx}.a`} render={({ field }) => (
                    <FormItem><FormLabel className="text-xs">Risposta</FormLabel><FormControl><Textarea {...field} rows={2} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => faqIt.append({ q: "", a: "" })}>
                <Plus className="size-3.5 mr-1" /> Aggiungi FAQ
              </Button>
            </div>
          </TabsContent>

          {/* -- EN --------------------------------------------- */}
          <TabsContent value="en" className="space-y-4">
            <FormField control={form.control} name="title_en" render={({ field }) => (
              <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="summary_en" render={({ field }) => (
              <FormItem><FormLabel>Tagline</FormLabel><FormControl><Input {...field} maxLength={120} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="description_en" render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} rows={4} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="space-y-2">
              <Label>Benefits</Label>
              {benefitsEn.fields.map((item, idx) => (
                <div key={item.id} className="flex gap-2">
                  <FormField control={form.control} name={`benefits_en.${idx}.value`} render={({ field }) => (
                    <FormItem className="flex-1"><FormControl><Input placeholder={`Benefit ${idx + 1}`} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => benefitsEn.remove(idx)}><Trash2 className="size-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => benefitsEn.append({ value: "" })}>
                <Plus className="size-3.5 mr-1" /> Add benefit
              </Button>
            </div>
            <div className="space-y-3">
              <Label>FAQ</Label>
              {faqEn.fields.map((item, idx) => (
                <div key={item.id} className="space-y-2 border rounded-md p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-muted-foreground">FAQ {idx + 1}</span>
                    <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => faqEn.remove(idx)}><Trash2 className="size-3" /></Button>
                  </div>
                  <FormField control={form.control} name={`faq_en.${idx}.q`} render={({ field }) => (
                    <FormItem><FormLabel className="text-xs">Question</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name={`faq_en.${idx}.a`} render={({ field }) => (
                    <FormItem><FormLabel className="text-xs">Answer</FormLabel><FormControl><Textarea {...field} rows={2} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => faqEn.append({ q: "", a: "" })}>
                <Plus className="size-3.5 mr-1" /> Add FAQ
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* -- Impostazioni ------------------------------------- */}
        <div className="border rounded-md p-4 space-y-4">
          <p className="text-sm font-semibold">Impostazioni</p>

          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="slug" render={({ field }) => (
              <FormItem><FormLabel>Slug *</FormLabel><FormControl><Input placeholder="nome-servizio" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="order" render={({ field }) => (
              <FormItem><FormLabel>Ordine</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>

          <div className="flex gap-6">
            <FormField control={form.control} name="inEvidenza" render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                <FormLabel className="cursor-pointer">In evidenza</FormLabel>
              </FormItem>
            )} />
            <FormField control={form.control} name="available" render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                <FormLabel className="cursor-pointer">Disponibile</FormLabel>
              </FormItem>
            )} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField control={form.control} name="basePrice" render={({ field }) => (
              <FormItem><FormLabel>Prezzo base (€)</FormLabel><FormControl><Input type="number" min={0} placeholder="Su richiesta" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="discountedPrice" render={({ field }) => (
              <FormItem><FormLabel>Prezzo scontato (€)</FormLabel><FormControl><Input type="number" min={0} placeholder="Nessuno" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="space-y-2">
              <Label>Etichetta prezzo</Label>
              <FormField control={form.control} name="priceLabel_it" render={({ field }) => (
                <FormItem><FormControl><Input placeholder="IT: a partire da" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="priceLabel_en" render={({ field }) => (
                <FormItem><FormControl><Input placeholder="EN: from" {...field} /></FormControl></FormItem>
              )} />
            </div>
          </div>

          {existing ? (
            <>
              {/* Cover image */}
              <div className="space-y-2">
                <Label>Immagine copertina</Label>
                {form.watch("imageUrl") ? (
                  <div className="relative w-full h-28 border rounded overflow-hidden">
                    <img
                      src={form.watch("imageUrl")}
                      alt="Cover"
                      className="w-full h-full object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 size-7 bg-red-600 hover:bg-red-700 text-white ring-2 ring-white"
                      onClick={() => {
                        form.setValue("imageUrl", "");
                        deleteServiceImage(existing.id, "cover").catch(() => null);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 border rounded p-3">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      ref={coverInputRef}
                      onChange={handleCoverUpload}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isUploading}
                      onClick={() => coverInputRef.current?.click()}
                    >
                      {isUploading ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Plus className="size-3.5 mr-1" />}
                      Carica immagine
                    </Button>
                    <span className="text-xs text-muted-foreground">PNG, JPEG o WebP · max 5MB</span>
                  </div>
                )}
              </div>

              {/* Gallery */}
              <div className="space-y-2">
                <Label>Gallery</Label>
                {images.fields.map((item, idx) => (
                  <div key={item.id} className="relative w-full h-24 border rounded overflow-hidden">
                    <img
                      src={item.url}
                      alt={`Gallery ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 size-7 bg-red-600 hover:bg-red-700 text-white ring-2 ring-white"
                      onClick={() => {
                        images.remove(idx);
                        deleteServiceImage(existing.id, `gallery-${idx}`).catch(() => null);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center gap-3 border rounded p-3">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    ref={galleryInputRef}
                    onChange={handleGalleryUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isUploading}
                    onClick={() => galleryInputRef.current?.click()}
                  >
                    {isUploading ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Plus className="size-3.5 mr-1" />}
                    Aggiungi immagine
                  </Button>
                  <span className="text-xs text-muted-foreground">PNG, JPEG o WebP · max 5MB</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground border rounded p-3">
              Salva il servizio per poter caricare le immagini.
            </p>
          )}
        </div>

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
          {existing ? "Salva modifiche" : "Crea servizio"}
        </Button>
      </form>
    </Form>
  );
}

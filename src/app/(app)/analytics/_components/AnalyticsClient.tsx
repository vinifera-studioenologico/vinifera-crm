"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Users,
  Eye,
  FlaskConical,
  UserPlus,
  Phone,
  MessageCircle,
  Play,
  ExternalLink,
  Loader2,
  AlertCircle,
  Ticket,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

// ── Types ─────────────────────────────────────────────────────────────

type RangeDays = 7 | 30 | 90;

interface KpiEntry { n: number; people: number }
interface AnalyticsData {
  traffic: { day: string; pageviews: number; visitors: number }[];
  kpis: Record<string, KpiEntry>;
  topPages: { path: string; views: number }[];
  topServices: { service: string; views: number }[];
  sources: { source: string; visitors: number }[];
  languages: { lang: string; n: number }[];
}
interface Recording {
  id: string;
  person: string;
  distinctId: string | null;
  duration: number;
  startTime: string;
  startUrl: string | null;
  clicks: number;
  replayUrl: string;
  personUrl: string | null;
}
interface ReplaysData { recordings: Recording[] }

// ── Helpers ───────────────────────────────────────────────────────────

const fmt = new Intl.NumberFormat("it-IT");

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pageLabel(path: string): string {
  if (!path) return "—";
  if (path === "/") return "Home";
  return path.replace(/-/g, " ").replace(/^\//, "").replace(/\//g, " › ");
}

function pct(num: number, den: number): string {
  if (!den) return "0%";
  return `${Math.round((num / den) * 100)}%`;
}

// ── Sub-components ────────────────────────────────────────────────────

function TrafficTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card shadow-md px-3 py-2 text-xs space-y-1">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {fmt.format(p.value)}
        </p>
      ))}
    </div>
  );
}

function BarList({
  items,
  labelKey,
  valueKey,
  emptyMsg,
}: {
  items: Record<string, string | number>[];
  labelKey: string;
  valueKey: string;
  emptyMsg: string;
}) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">{emptyMsg}</p>;
  }
  const max = Math.max(...items.map((i) => Number(i[valueKey])), 1);
  return (
    <ul className="space-y-2">
      {items.map((item, idx) => {
        const val = Number(item[valueKey]);
        const label = String(item[labelKey]);
        return (
          <li key={idx} className="text-xs">
            <div className="flex justify-between mb-0.5">
              <span className="text-foreground truncate max-w-[70%]" title={label}>
                {label}
              </span>
              <span className="text-muted-foreground tabular-nums">{fmt.format(val)}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${(val / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="pt-6 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-sm">Analytics non disponibile</p>
          <p className="text-xs text-muted-foreground mt-0.5">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function AnalyticsClient() {
  const [days, setDays] = useState<RangeDays>(30);

  const {
    data,
    isFetching,
    isPending,
    error,
  } = useQuery<AnalyticsData>({
    queryKey: ["analytics", days],
    queryFn: async () => {
      const res = await fetch(`/api/analytics?days=${days}`);
      if (res.status === 502) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "PostHog non raggiungibile o non configurato");
      }
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const {
    data: replaysData,
    isFetching: replaysFetching,
    error: replaysError,
  } = useQuery<ReplaysData>({
    queryKey: ["analytics-replays"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/replays");
      if (res.status === 502) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "PostHog non raggiungibile");
      }
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  // ── Derived KPIs ──
  const kpis = data?.kpis ?? {};
  const pageviews = kpis["$pageview"]?.n ?? 0;
  const visitors = kpis["$pageview"]?.people ?? 0;
  const servicesViewed = kpis["service_viewed"]?.n ?? 0;
  const leadsSubmitted = kpis["lead_submitted"]?.n ?? 0;
  const leadsSubmittedPeople = kpis["lead_submitted"]?.people ?? 0;
  const phoneCalls = kpis["phone_call_clicked"]?.n ?? 0;
  const whatsappClicks = kpis["whatsapp_clicked"]?.n ?? 0;
  const modalOpened = kpis["lead_modal_opened"]?.n ?? 0;
  const conversionRate = visitors > 0
    ? ((leadsSubmittedPeople / visitors) * 100).toFixed(1)
    : "0";
  const checkoutStarted = kpis["event_checkout_started"]?.n ?? 0;
  const checkoutCompleted = kpis["event_checkout_completed"]?.n ?? 0;
  const checkoutExpired = kpis["event_checkout_expired"]?.n ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Analytics</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mt-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Analytics sito</h1>
            {isFetching && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Periodo:</span>
            {([7, 30, 90] as RangeDays[]).map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? "default" : "outline"}
                className="text-xs"
                onClick={() => setDays(d)}
              >
                {d}g
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Dati aggiornati ~ogni 5 min (cache) · Fonte: PostHog EU
        </p>
      </div>

      {/* Error state */}
      {error && !isPending && (
        <ErrorCard message={String((error as Error).message)} />
      )}

      {/* Loading skeleton on first fetch */}
      {isPending && !error && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 animate-pulse">
          {Array.from({ length: 7 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-5">
                <div className="h-3 bg-muted rounded w-2/3 mb-2" />
                <div className="h-7 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Main content — shown when we have data (even if stale/refetching) */}
      {data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {[
              { label: "Visitatori unici", value: visitors, icon: Users },
              { label: "Pageview", value: pageviews, icon: Eye },
              { label: "Servizi visti", value: servicesViewed, icon: FlaskConical },
              { label: "Lead inviati", value: leadsSubmitted, icon: UserPlus },
              { label: "Click telefono", value: phoneCalls, icon: Phone },
              { label: "Click WhatsApp", value: whatsappClicks, icon: MessageCircle },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label}>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                  <p className="text-2xl font-semibold tabular-nums">{fmt.format(value)}</p>
                </CardContent>
              </Card>
            ))}
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground mb-1">Tasso conversione</p>
                <p className="text-2xl font-semibold tabular-nums">{conversionRate}%</p>
                <p className="text-xs text-muted-foreground">lead / visitatori</p>
              </CardContent>
            </Card>
          </div>

          {/* Traffic chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Traffico giornaliero</CardTitle>
              <CardDescription>Visitatori unici e pageview negli ultimi {days} giorni</CardDescription>
            </CardHeader>
            <CardContent>
              {data.traffic.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun dato nel periodo</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart
                    data={data.traffic}
                    margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: string) => v.slice(5)} // MM-DD
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip content={<TrafficTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="visitors"
                      name="Visitatori"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="pageviews"
                      name="Pageview"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Top pages + Top services */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top pagine</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  items={data.topPages.map((p) => ({ label: pageLabel(p.path), value: p.views }))}
                  labelKey="label"
                  valueKey="value"
                  emptyMsg="Nessun dato nel periodo"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Servizi più visti</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  items={data.topServices.map((s) => ({
                    label: s.service.replace(/-/g, " "),
                    value: s.views,
                  }))}
                  labelKey="label"
                  valueKey="value"
                  emptyMsg="Nessun dato nel periodo"
                />
              </CardContent>
            </Card>
          </div>

          {/* Sources + Language split */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sorgenti di traffico</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  items={data.sources.map((s) => ({ label: s.source, value: s.visitors }))}
                  labelKey="label"
                  valueKey="value"
                  emptyMsg="Nessun dato nel periodo"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lingua</CardTitle>
                <CardDescription>Switch di lingua registrati</CardDescription>
              </CardHeader>
              <CardContent>
                {data.languages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessun dato nel periodo</p>
                ) : (
                  <div className="flex gap-3 flex-wrap">
                    {data.languages.map(({ lang, n }) => (
                      <div key={lang} className="flex flex-col items-center gap-1">
                        <span className="text-2xl font-semibold tabular-nums">{fmt.format(n)}</span>
                        <span className="text-xs text-muted-foreground uppercase font-medium">{lang}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Funnel di conversione */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Funnel di conversione</CardTitle>
              <CardDescription>Dall&apos;arrivo sul sito all&apos;invio del lead</CardDescription>
            </CardHeader>
            <CardContent>
              {pageviews === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun dato nel periodo</p>
              ) : (
                <div className="space-y-3">
                  {[
                    { label: "Visitatori (pageview)", count: pageviews, prev: pageviews },
                    { label: "Servizio visto", count: servicesViewed, prev: pageviews },
                    { label: "Modal aperto", count: modalOpened, prev: servicesViewed },
                    { label: "Lead inviato", count: leadsSubmitted, prev: modalOpened },
                  ].map(({ label, count, prev }, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-foreground">{label}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {fmt.format(count)}{idx > 0 && ` (${pct(count, prev)})`}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${pageviews > 0 ? (count / pageviews) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Modulo eventi — checkout */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-1.5">
                <Ticket className="h-4 w-4 text-muted-foreground" />
                Prenotazioni eventi
              </CardTitle>
              <CardDescription>Checkout avviati, completati e scaduti (gratuiti + a pagamento)</CardDescription>
            </CardHeader>
            <CardContent>
              {checkoutStarted === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun dato nel periodo</p>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Checkout avviati", value: checkoutStarted },
                    {
                      label: "Completati",
                      value: checkoutCompleted,
                      hint: pct(checkoutCompleted, checkoutStarted),
                    },
                    {
                      label: "Scaduti",
                      value: checkoutExpired,
                      hint: pct(checkoutExpired, checkoutStarted),
                    },
                  ].map(({ label, value, hint }) => (
                    <div key={label}>
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      <p className="text-2xl font-semibold tabular-nums">
                        {fmt.format(value)}
                        {hint && (
                          <span className="text-xs text-muted-foreground font-normal ml-1.5">
                            {hint}
                          </span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Session Replays */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Ultime sessioni registrate</CardTitle>
              <CardDescription>Click su &quot;Guarda replay&quot; apre il player su PostHog</CardDescription>
            </div>
            {replaysFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
        <CardContent>
          {replaysError ? (
            <ErrorCard message={String((replaysError as Error).message)} />
          ) : !replaysData ? (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded" />
              ))}
            </div>
          ) : replaysData.recordings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna registrazione recente</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left pb-2 font-medium pr-4">Persona</th>
                    <th className="text-left pb-2 font-medium pr-4">Inizio</th>
                    <th className="text-right pb-2 font-medium pr-4">Durata</th>
                    <th className="text-right pb-2 font-medium pr-4">Click</th>
                    <th className="text-left pb-2 font-medium pr-4">Pagina ingresso</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {replaysData.recordings.map((rec) => (
                    <tr key={rec.id} className="border-b border-border/50 hover:bg-muted/40">
                      <td className="py-2 pr-4 font-medium truncate max-w-[140px]">
                        {rec.personUrl ? (
                          <a
                            href={rec.personUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline text-blue-500"
                            title="Apri profilo su PostHog"
                          >
                            {rec.person}
                          </a>
                        ) : (
                          rec.person
                        )}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                        {rec.startTime
                          ? format(new Date(rec.startTime), "d MMM, HH:mm", { locale: itLocale })
                          : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {fmtDuration(rec.duration)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {fmt.format(rec.clicks)}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground truncate max-w-[160px]">
                        {rec.startUrl
                          ? (() => {
                              try {
                                return new URL(rec.startUrl).pathname;
                              } catch {
                                return rec.startUrl;
                              }
                            })()
                          : "—"}
                      </td>
                      <td className="py-2">
                        <a
                          href={rec.replayUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline font-medium whitespace-nowrap"
                        >
                          <Play className="h-3 w-3" />
                          Guarda replay
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use server";
import "server-only";

import { requireAdmin } from "@/server/auth";
import { hogql } from "./client";

export type RangeDays = 7 | 30 | 90;

/** Trend visitatori + pageview per giorno. */
export async function getTraffic(days: RangeDays) {
  await requireAdmin();
  const { results } = await hogql<[string, number, number]>(
    `SELECT toDate(timestamp) AS day, count() AS pageviews,
            count(DISTINCT person_id) AS visitors
     FROM events
     WHERE event = '$pageview' AND timestamp >= now() - INTERVAL ${days} DAY
     GROUP BY day ORDER BY day`,
    "crm_traffic_trend",
  );
  return results.map(([day, pageviews, visitors]) => ({ day, pageviews, visitors }));
}

/** KPI riepilogo (una query per tutti gli eventi chiave). */
export async function getKpis(days: RangeDays) {
  await requireAdmin();
  const { results } = await hogql<[string, number, number]>(
    `SELECT event, count() AS n, count(DISTINCT person_id) AS people
     FROM events
     WHERE timestamp >= now() - INTERVAL ${days} DAY
       AND event IN ('$pageview','service_viewed','lead_modal_opened',
                     'lead_submitted','phone_call_clicked','whatsapp_clicked')
     GROUP BY event`,
    "crm_kpi_summary",
  );
  return Object.fromEntries(results.map(([e, n, people]) => [e, { n, people }])) as
    Record<string, { n: number; people: number }>;
}

/** Top 10 pagine per pageview. */
export async function getTopPages(days: RangeDays) {
  await requireAdmin();
  const { results } = await hogql<[string, number]>(
    `SELECT properties.$pathname AS path, count() AS views
     FROM events
     WHERE event = '$pageview' AND timestamp >= now() - INTERVAL ${days} DAY
     GROUP BY path ORDER BY views DESC LIMIT 10`,
    "crm_top_pages",
  );
  return results.map(([path, views]) => ({ path, views }));
}

/** Top 10 servizi visti. */
export async function getTopServices(days: RangeDays) {
  await requireAdmin();
  const { results } = await hogql<[string, number]>(
    `SELECT properties.service AS service, count() AS views
     FROM events
     WHERE event = 'service_viewed' AND timestamp >= now() - INTERVAL ${days} DAY
     GROUP BY service ORDER BY views DESC LIMIT 10`,
    "crm_top_services",
  );
  return results.map(([service, views]) => ({ service, views }));
}

/** Top 10 sorgenti di traffico (UTM / referrer / diretto). */
export async function getSources(days: RangeDays) {
  await requireAdmin();
  const { results } = await hogql<[string, number]>(
    `SELECT coalesce(nullIf(properties.utm_source, ''),
                     properties.$referring_domain, 'diretto') AS source,
            count(DISTINCT person_id) AS visitors
     FROM events
     WHERE event = '$pageview' AND timestamp >= now() - INTERVAL ${days} DAY
     GROUP BY source ORDER BY visitors DESC LIMIT 10`,
    "crm_sources",
  );
  return results.map(([source, visitors]) => ({ source, visitors }));
}

/** Split per lingua (language_switched events). */
export async function getLanguageSplit(days: RangeDays) {
  await requireAdmin();
  const { results } = await hogql<[string, number]>(
    `SELECT properties.to AS lang, count() AS n
     FROM events
     WHERE event = 'language_switched' AND timestamp >= now() - INTERVAL ${days} DAY
     GROUP BY lang ORDER BY n DESC`,
    "crm_language_split",
  );
  return results.map(([lang, n]) => ({ lang, n }));
}

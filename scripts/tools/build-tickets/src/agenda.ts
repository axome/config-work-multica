import ical, { type Attendee, type VEvent } from 'node-ical';
import { ARTHUR, PROJECT_CODE, parisDate, readSecret } from './config.ts';

export type WorkSlot = { date: string; title: string; code: string };
export type RunSlot = { date: string; title: string };

const text = (v: unknown): string => (typeof v === 'string' ? v : (v as { val?: string })?.val ?? '');

function declinedByArthur(event: VEvent): boolean {
  const attendees: Attendee[] = event.attendee ? ([] as Attendee[]).concat(event.attendee) : [];
  return attendees.some((a) => {
    const email = text(a).toLowerCase();
    const partstat = typeof a === 'string' ? undefined : a.params?.PARTSTAT;
    return email.includes(ARTHUR.email) && partstat === 'DECLINED';
  });
}

/** Créneau RUN : « RUN AXOME », « RUN GOUIRAN », « … [RUN 2026] »… mais pas les réunions Daily RUN ou Check Planning RUN. */
export const isRunSlot = (title: string) => /\bRUN\b/i.test(title) && !/daily run|check planning run/i.test(title);

/**
 * Créneaux de l'agenda pour les dates demandées (YYYY-MM-DD, heure de Paris), hors événements annulés ou déclinés :
 * BUILD = titre avec un code projet P-AXO et sans RUN ; RUN = voir isRunSlot.
 */
export async function agendaSlots(dates: string[]): Promise<{ build: WorkSlot[]; run: RunSlot[] }> {
  const url = readSecret('google/calendar.env', 'GOOGLE_CALENDAR_ICS_URL');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`agenda : HTTP ${res.status}`);
  const calendar = ical.parseICS(await res.text());

  const wanted = new Set(dates);
  const from = new Date(`${dates[0]}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${dates[dates.length - 1]}T23:59:59Z`);
  to.setUTCDate(to.getUTCDate() + 1);

  const build: WorkSlot[] = [];
  const run: RunSlot[] = [];
  for (const component of Object.values(calendar)) {
    if (component?.type !== 'VEVENT') continue;
    const event = component as VEvent;
    const instances = event.rrule
      ? ical.expandRecurringEvent(event, { from, to }).map((i) => ({ start: i.start, event: i.event }))
      : [{ start: event.start, event }];
    for (const { start, event: instance } of instances) {
      const date = parisDate(start);
      if (!wanted.has(date) || instance.status === 'CANCELLED' || declinedByArthur(instance)) continue;
      const title = text(instance.summary).trim();
      if (isRunSlot(title)) run.push({ date, title });
      else {
        const code = title.match(PROJECT_CODE)?.[0];
        if (code) build.push({ date, title, code });
      }
    }
  }
  const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);
  return { build: build.sort(byDate), run: run.sort(byDate) };
}

// Récapitulatif du temps chronométré par Arthur sur les boards RUN pour une journée (par défaut aujourd'hui, heure de Paris).
// Signale aussi les tickets du jour sans temps : ceux d'Arthur en « A faire aujourd'hui » et ceux qu'il a modifiés dans la journée.
// Usage : temps-run [--date YYYY-MM-DD]. Monday en lecture seule.
import { parseArgs } from 'node:util';
import { ARTHUR, RUN_BOARDS, RUN_STATUS, TIME_ZONE, parisDate } from './config.ts';
import { query } from './monday.ts';

type Column = { id: string; title: string; type: string; settings_str: string };
type Log = { data: string; created_at: string };
type Session = { started_at: string | null; ended_at: string | null; started_user_id: string | null; status: string };
type Item = {
  id: string;
  name: string;
  url: string;
  board: { id: string };
  column_values: { id: string; text: string | null; running?: boolean | null; started_at?: string | null; history?: Session[] }[];
};
type Row = { name: string; url: string; where: string; status: string; secs: number; running: boolean; why?: string };

const { values: opts } = parseArgs({ options: { date: { type: 'string' } } });
const day = opts.date ?? parisDate(new Date());
const now = Date.now();
// Minuit à Paris tombe la veille à 22 h ou 23 h UTC : on part de 22 h UTC, puis on filtre sur la date de Paris.
const from = new Date(Date.parse(`${day}T00:00:00Z`) - 2 * 3600e3).toISOString();
// created_at des journaux d'activité Monday : centaines de nanosecondes depuis 1970.
const logDate = (l: Log) => parisDate(new Date(Number(l.created_at) / 1e4));

/** Journaux d'activité d'Arthur sur un board depuis le début de la journée (toutes colonnes). */
async function arthurLogs(boardId: number): Promise<Log[]> {
  const logs: Log[] = [];
  for (let page = 1; ; page++) {
    const data = await query<{ boards: { activity_logs: Log[] }[] }>(
      `query ($b: [ID!], $u: [ID!], $from: ISO8601DateTime, $to: ISO8601DateTime, $page: Int) {
        boards(ids: $b) { activity_logs(from: $from, to: $to, user_ids: $u, limit: 500, page: $page) { data created_at } } }`,
      { b: [boardId], u: [ARTHUR.mondayId], from, to: new Date(now).toISOString(), page },
    );
    const batch = data.boards[0]?.activity_logs ?? [];
    logs.push(...batch);
    if (batch.length < 500) return logs;
  }
}

/** Items d'Arthur (colonne de personnes du board) au statut « A faire aujourd'hui », filtrés côté serveur. */
async function todayItems(boardId: number, people: Column, status: Column): Promise<string[]> {
  const labels = (JSON.parse(status.settings_str).labels ?? {}) as Record<string, string>;
  const index = Object.entries(labels).find(([, label]) => label === RUN_STATUS)?.[0];
  if (index === undefined) return [];
  const ids: string[] = [];
  let data = await query<{ boards: { items_page: { cursor: string | null; items: { id: string }[] } }[] }>(
    `query ($b: [ID!], $p: ID!, $pv: CompareValue!, $s: ID!, $sv: CompareValue!) {
      boards(ids: $b) { items_page(limit: 100, query_params: { rules: [
        { column_id: $p, compare_value: $pv, operator: any_of }, { column_id: $s, compare_value: $sv, operator: any_of }] }) {
        cursor items { id } } } }`,
    { b: [boardId], p: people.id, pv: [`person-${ARTHUR.mondayId}`], s: status.id, sv: [Number(index)] },
  );
  let page = data.boards[0]?.items_page;
  while (page) {
    ids.push(...page.items.map((i) => i.id));
    if (!page.cursor) break;
    page = (await query<{ next_items_page: typeof page }>(`query ($c: String!) { next_items_page(limit: 100, cursor: $c) { cursor items { id } } }`, { c: page.cursor })).next_items_page;
  }
  return ids;
}

async function itemsByIds(ids: string[]): Promise<Item[]> {
  const items: Item[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const data = await query<{ items: Item[] }>(
      `query ($ids: [ID!]) { items(ids: $ids, limit: 100) { id name url board { id }
        column_values { id text ... on TimeTrackingValue { running started_at history { started_at ended_at started_user_id status } } } } }`,
      { ids: ids.slice(i, i + 100) },
    );
    items.push(...data.items);
  }
  return items;
}

const rows: Row[] = [];
for (const rb of RUN_BOARDS) {
  const board = (await query<{ boards: { name: string; columns: Column[] }[] }>(
    `query ($b: [ID!]) { boards(ids: $b) { name columns { id title type settings_str } } }`,
    { b: [rb.id] },
  )).boards[0];
  const col = (title: string) => board.columns.find((c) => c.title === title);
  const [status, people, client] = [col(rb.statusTitle), col(rb.peopleTitle), rb.clientTitle ? col(rb.clientTitle) : undefined];
  const timer = board.columns.find((c) => c.type === 'time_tracking');
  if (!status || !people || !timer) throw new Error(`board RUN ${rb.id} : colonne de statut, de personnes ou chronomètre introuvable`);

  // Tickets à regarder : chronomètre modifié par Arthur depuis le début de la journée (une saisie manuelle peut viser
  // un autre jour, d'où le filtre sur la date des sessions plus bas), ticket modifié par Arthur ce jour-là, ticket du jour.
  const why = new Map<string, string>();
  for (const log of await arthurLogs(rb.id)) {
    const d = JSON.parse(log.data) as { pulse_id?: number; column_id?: string; column_title?: string };
    const isTimer = d.column_id === timer.id;
    if (!d.pulse_id || (!isTimer && logDate(log) !== day)) continue;
    const id = String(d.pulse_id);
    if (!isTimer && !why.get(id)) why.set(id, `modifié par toi (${d.column_title ?? 'ticket'})`);
    else if (!why.has(id)) why.set(id, '');
  }
  if (day === parisDate(new Date())) {
    for (const id of await todayItems(rb.id, people, status)) if (!why.get(id)) why.set(id, RUN_STATUS);
  }

  for (const item of await itemsByIds([...why.keys()])) {
    const tt = item.column_values.find((c) => c.id === timer.id);
    let secs = 0;
    let running = false;
    for (const s of tt?.history ?? []) {
      if (s.status === 'deleted' || Number(s.started_user_id) !== ARTHUR.mondayId || !s.started_at) continue;
      if (parisDate(new Date(s.started_at)) !== day) continue;
      secs += ((s.ended_at ? Date.parse(s.ended_at) : now) - Date.parse(s.started_at)) / 1e3;
      if (!s.ended_at) running = true;
    }
    // Chrono lancé et pas encore dans l'historique : la session en cours compte jusqu'à maintenant.
    if (tt?.running && !running && tt.started_at && parisDate(new Date(tt.started_at)) === day) {
      secs += (now - Date.parse(tt.started_at)) / 1e3;
      running = true;
    }
    const text = (c?: Column) => (c && item.column_values.find((v) => v.id === c.id)?.text) || '';
    rows.push({
      name: item.name,
      url: item.url,
      where: text(client) || board.name.replace(/^\[[^\]]*\]\s*/, ''),
      status: text(status),
      secs: Math.round(secs),
      running,
      why: why.get(item.id),
    });
  }
}

const hm = (secs: number) => {
  const m = Math.round(secs / 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};
const link = (r: Row) => `[${r.name.length > 90 ? `${r.name.slice(0, 89)}…` : r.name}](${r.url})`;
const timed = rows.filter((r) => r.secs > 0).sort((a, b) => b.secs - a.secs);
const missing = rows.filter((r) => r.secs === 0 && r.why);
const runningRows = timed.filter((r) => r.running);
const total = timed.reduce((s, r) => s + r.secs, 0);
const label = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${day}T12:00:00Z`));

const out = [`# Temps RUN du ${label}`, '', `**Total : ${hm(total)}** sur ${timed.length} ticket(s)`];
if (timed.length) {
  out.push('', '| Ticket | Client | Statut | Temps |', '|---|---|---|---|');
  for (const r of timed) out.push(`| ${link(r)} | ${r.where} | ${r.status} | ${hm(r.secs)}${r.running ? ' ⏱' : ''} |`);
}
if (missing.length || runningRows.length) {
  out.push('', '## À vérifier');
  for (const r of runningRows) out.push(`- ⏱ Chrono encore en cours : ${link(r)} (${r.where})`);
  for (const r of missing) out.push(`- Sans temps : ${link(r)} (${r.where}, ${r.status || 'sans statut'}) — ${r.why}`);
} else {
  out.push('', 'Rien à signaler : tous les tickets du jour ont du temps.');
}
console.log(out.join('\n'));

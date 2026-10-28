import { ARTHUR, isActiveStatus, readSecret, runBoard, type RunBoard } from './config.ts';

const API = 'https://api.monday.com/v2';
const token = readSecret('monday/default.env', 'MONDAY_API_TOKEN');

/** Lecture seule : ce module n'envoie que des requêtes `query`, jamais de `mutation`. */
export async function query<T>(gql: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (/^\s*mutation\b/.test(gql)) throw new Error('écriture Monday interdite');
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': '2025-04' },
    body: JSON.stringify({ query: gql, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[]; error_message?: string };
  if (!res.ok || json.errors || !json.data) {
    throw new Error(`Monday : ${json.errors?.map((e) => e.message).join(' ; ') ?? json.error_message ?? res.status}`);
  }
  return json.data;
}

export type Board = { id: number; name: string };
type Column = { id: string; title: string; type: string; settings_str: string };
type ColumnValue = { id: string; text: string | null };
type RawAsset = { id: string; name: string; file_extension: string; file_size: number; public_url: string };
type RawMessage = { text_body: string; created_at: string; creator?: { name: string }; assets?: RawAsset[] };
type RawUpdate = RawMessage & { replies?: RawMessage[] };
type RawItem = {
  id: string;
  name: string;
  url: string;
  board?: { id: string; name: string };
  group?: { title: string };
  parent_item?: { id: string; name: string };
  column_values: ColumnValue[];
  updates?: RawUpdate[];
  assets?: RawAsset[];
  subitems?: { name: string; column_values: ColumnValue[] }[];
};

/** Fichier Monday : lien de téléchargement temporaire (environ une heure). */
export type Asset = { id: string; name: string; ext: string; size: number; url: string };
/** Message Monday ; les fichiers ne sont exposés par l'API que sur les messages principaux, pas sur les réponses. */
export type Message = { date: string; author: string; text: string; files: Asset[] };
/** Fil Monday : message principal et ses réponses, dans l'ordre chronologique. */
export type Thread = Message & { replies: Message[] };

const toAsset = (a: RawAsset): Asset => ({ id: String(a.id), name: a.name, ext: (a.file_extension ?? '').replace(/^\./, '').toLowerCase(), size: Number(a.file_size) || 0, url: a.public_url });
const toMessage = (m: RawMessage): Message => ({
  date: m.created_at,
  author: m.creator?.name ?? '?',
  text: m.text_body.trim(),
  files: (m.assets ?? []).map(toAsset),
});
/** Fils dans l'ordre de Monday : du plus récent au plus ancien, réponses dans l'ordre chronologique. */
const toThreads = (updates: RawUpdate[] = []): Thread[] =>
  updates
    .map((u) => ({ ...toMessage(u), replies: (u.replies ?? []).map(toMessage).sort((a, b) => a.date.localeCompare(b.date)) }))
    .sort((a, b) => b.date.localeCompare(a.date));
/** Tous les messages (principaux et réponses), du plus ancien au plus récent. */
export const allMessages = (threads: Thread[]): Message[] =>
  threads.flatMap((t) => [t, ...t.replies]).sort((a, b) => a.date.localeCompare(b.date));

export type Ticket = {
  itemId: string;
  name: string;
  url: string;
  board: Board;
  group?: string;
  parent?: string;
  status: string;
  timeline?: string;
  people?: string;
  /** Échanges Monday : fils du plus récent au plus ancien, réponses comprises. */
  threads: Thread[];
  /** Fichiers des colonnes « fichiers » du ticket (hors messages). */
  files: Asset[];
  /** Colonnes utiles d'un ticket RUN, par rôle : client, zendesk, zendeskUrl, priority, deadline, cdp, planned, site. */
  fields: Record<string, string>;
  /** Horodatage complet de la mise à jour la plus récente, pour le suivi après import. */
  lastUpdateAt?: string;
  subitems: { name: string; status?: string; people?: string }[];
};

/** Tous les boards actifs du workspace « Projets des clients », pour retrouver un board par son code P-AXO. */
export async function listBoards(workspaceId = 7022194): Promise<Board[]> {
  const boards: Board[] = [];
  for (let page = 1; ; page++) {
    const data = await query<{ boards: { id: string; name: string; type: string }[] }>(
      `query ($ws: [ID!], $page: Int!) { boards(workspace_ids: $ws, state: active, limit: 100, page: $page) { id name type } }`,
      { ws: [workspaceId], page },
    );
    boards.push(...data.boards.filter((b) => b.type === "board").map((b) => ({ id: Number(b.id), name: b.name })));
    if (data.boards.length < 100) return boards;
  }
}

export async function boardDetails(boardId: number): Promise<{ description: string; url: string }> {
  const data = await query<{ boards: { description: string | null; url: string }[] }>(
    `query ($id: [ID!]) { boards(ids: $id) { description url } }`,
    { id: [boardId] },
  );
  return { description: data.boards[0]?.description ?? '', url: data.boards[0]?.url ?? '' };
}

async function columnsOf(boardId: number): Promise<Column[]> {
  const data = await query<{ boards: { columns: Column[] }[] }>(
    `query ($id: [ID!]) { boards(ids: $id) { columns { id title type settings_str } } }`,
    { id: [boardId] },
  );
  return data.boards[0]?.columns ?? [];
}

const pick = (columns: Column[], type: string, title: RegExp) =>
  columns.find((c) => c.type === type && title.test(c.title)) ?? columns.find((c) => c.type === type);

const ASSET_FIELDS = 'assets { id name file_extension file_size public_url }';
const UPDATE_FIELDS = `updates(limit: 25) { text_body created_at creator { name } ${ASSET_FIELDS} replies { text_body created_at creator { name } } }`;
const ITEM_FIELDS = `id name url board { id name } group { title } parent_item { id name } column_values { id text }
  ${ASSET_FIELDS} ${UPDATE_FIELDS}
  subitems { name column_values { id text } }`;

/** Items d'un board où Arthur est dans la colonne Personne (filtre côté serveur). */
async function itemsForArthur(boardId: number, peopleColumn: string): Promise<RawItem[]> {
  const items: RawItem[] = [];
  let data = await query<{ boards: { items_page: { cursor: string | null; items: RawItem[] } }[] }>(
    `query ($id: [ID!], $col: ID!, $val: CompareValue!) {
      boards(ids: $id) { items_page(limit: 100, query_params: { rules: [{ column_id: $col, compare_value: $val, operator: any_of }] }) {
        cursor items { ${ITEM_FIELDS} } } } }`,
    { id: [boardId], col: peopleColumn, val: [`person-${ARTHUR.mondayId}`] },
  );
  let page = data.boards[0]?.items_page;
  while (page) {
    items.push(...page.items);
    if (!page.cursor) break;
    const next = await query<{ next_items_page: { cursor: string | null; items: RawItem[] } }>(
      `query ($c: String!) { next_items_page(limit: 100, cursor: $c) { cursor items { ${ITEM_FIELDS} } } }`,
      { c: page.cursor },
    );
    page = next.next_items_page;
  }
  return items;
}

function toTicket(
  item: RawItem,
  board: Board,
  cols: { status?: Column; timeline?: Column; people?: Column },
  extra: Record<string, Column | undefined> = {},
): Ticket {
  const value = (c?: Column) => (c ? item.column_values.find((v) => v.id === c.id)?.text || undefined : undefined);
  const fields: Record<string, string> = {};
  for (const [role, col] of Object.entries(extra)) {
    const v = value(col);
    if (v) fields[role] = v;
  }
  return {
    fields,
    itemId: item.id,
    name: item.name,
    url: item.url,
    board,
    group: item.group?.title,
    parent: item.parent_item?.name,
    status: value(cols.status) ?? '',
    timeline: value(cols.timeline),
    people: value(cols.people),
    threads: toThreads(item.updates),
    files: (item.assets ?? []).map(toAsset),
    lastUpdateAt: allMessages(toThreads(item.updates)).map((m) => m.date).pop(),
    subitems: (item.subitems ?? []).map((s) => ({
      name: s.name,
      status: s.column_values.find((v) => v.id === 'status')?.text || undefined,
      people: s.column_values.find((v) => /^person/.test(v.id))?.text || undefined,
    })),
  };
}

export type ItemState = {
  id: string;
  state: string;
  status: string;
  assignedToArthur: boolean;
  /** Messages principaux et réponses, du plus ancien au plus récent. */
  messages: (Message & { isReply: boolean })[];
};

/** État actuel d'items déjà importés (statut, attribution à Arthur, mises à jour), par lots de 100. */
export async function itemStates(ids: string[]): Promise<Map<string, ItemState>> {
  const states = new Map<string, ItemState>();
  for (let i = 0; i < ids.length; i += 100) {
    const data = await query<{
      items: {
        id: string;
        state: string;
        board: { id: string };
        column_values: { type: string; text: string | null; column: { title: string }; persons_and_teams?: { id: string; kind: string }[] }[];
        updates: RawUpdate[];
      }[];
    }>(
      `query ($ids: [ID!]) { items(ids: $ids, limit: 100) { id state board { id }
        column_values { type text column { title } ... on PeopleValue { persons_and_teams { id kind } } }
        ${UPDATE_FIELDS} } }`,
      { ids: ids.slice(i, i + 100) },
    );
    for (const item of data.items) {
      // Board RUN : colonnes connues (RUN_BOARDS). Sinon, même règle que l'import BUILD : « Statut » et « Personne… »,
      // à défaut la première colonne de statut et toutes les colonnes de personnes.
      const rb = runBoard(Number(item.board.id));
      const statusCol = rb
        ? item.column_values.find((c) => c.type === 'status' && c.column.title === rb.statusTitle)
        : (item.column_values.find((c) => c.type === 'status' && /^Statut$/i.test(c.column.title)) ??
          item.column_values.find((c) => c.type === 'status'));
      const allPeople = item.column_values.filter((c) => c.type === 'people');
      const named = allPeople.filter((c) => (rb ? c.column.title === rb.peopleTitle : /^Personne/i.test(c.column.title)));
      const peopleCols = named.length || rb ? named : allPeople;
      states.set(item.id, {
        id: item.id,
        state: item.state,
        status: statusCol?.text ?? '',
        assignedToArthur: peopleCols.some((c) => c.persons_and_teams?.some((p) => p.kind === 'person' && Number(p.id) === ARTHUR.mondayId)),
        messages: toThreads(item.updates)
          .flatMap((t) => [{ ...t, isReply: false }, ...t.replies.map((r) => ({ ...r, isReply: true }))])
          .sort((a, b) => a.date.localeCompare(b.date)),
      });
    }
  }
  return states;
}

/** Tickets BUILD d'Arthur à traiter (« En cours », « Planifié », « A corriger ») sur un board, éléments et sous-éléments. */
const buildColumns = (columns: Column[]) => ({
  status: pick(columns, 'status', /^Statut$/i),
  timeline: pick(columns, 'timeline', /date|période|échéance/i),
  people: pick(columns, 'people', /^Personne/i),
});

function runColumns(columns: Column[], rb: RunBoard) {
  const byTitle = (title: string) => columns.find((c) => c.title === title);
  const byRe = (re: RegExp, type?: string) => columns.find((c) => re.test(c.title) && (!type || c.type === type));
  return {
    cols: { status: byTitle(rb.statusTitle), people: byTitle(rb.peopleTitle), timeline: byRe(/^Timeline$/i, 'timeline') },
    extra: {
      client: rb.clientTitle ? byTitle(rb.clientTitle) : undefined,
      zendesk: byRe(/^Ticket \(Zendesk\)$/),
      zendeskUrl: byRe(/^Lien ticket/),
      priority: byRe(/^Priorit/i, 'status') ?? byRe(/^Priority$/i, 'status'),
      deadline: byRe(/^Dead?ine|^Deadline/i),
      cdp: byRe(/^CDP/),
      planned: byRe(/^Date planifiée$/),
      site: byRe(/^(Site|Boutique)/),
    } as Record<string, Column | undefined>,
  };
}

/** Relit des tickets déjà importés par leur ID (pour rafraîchir la description des issues). */
export async function ticketsByIds(ids: string[]): Promise<Ticket[]> {
  const tickets: Ticket[] = [];
  const columnsCache = new Map<number, Column[]>();
  for (let i = 0; i < ids.length; i += 50) {
    const data = await query<{ items: RawItem[] }>(`query ($ids: [ID!]) { items(ids: $ids, limit: 100) { ${ITEM_FIELDS} } }`, { ids: ids.slice(i, i + 50) });
    for (const item of data.items) {
      const boardId = Number(item.board?.id);
      if (!columnsCache.has(boardId)) columnsCache.set(boardId, await columnsOf(boardId));
      const columns = columnsCache.get(boardId)!;
      const board = { id: boardId, name: item.board?.name ?? String(boardId) };
      const rb = runBoard(boardId);
      if (rb) {
        const { cols, extra } = runColumns(columns, rb);
        tickets.push(toTicket(item, board, cols, extra));
      } else tickets.push(toTicket(item, board, buildColumns(columns)));
    }
  }
  return tickets;
}

export async function ticketsForArthur(board: Board): Promise<Ticket[]> {
  const columns = await columnsOf(board.id);
  const cols = buildColumns(columns);
  if (!cols.people || !cols.status) return [];
  const tickets = (await itemsForArthur(board.id, cols.people.id)).map((i) => toTicket(i, board, cols));

  const subBoardId = (() => {
    const sub = columns.find((c) => c.type === 'subtasks');
    try {
      return (JSON.parse(sub?.settings_str ?? '{}') as { boardIds?: number[] }).boardIds?.[0];
    } catch {
      return undefined;
    }
  })();
  if (subBoardId) {
    const subColumns = await columnsOf(subBoardId);
    const subCols = buildColumns(subColumns);
    if (subCols.people && subCols.status) {
      tickets.push(...(await itemsForArthur(subBoardId, subCols.people.id)).map((i) => toTicket(i, board, subCols)));
    }
  }
  return tickets.filter((t) => isActiveStatus('build', t.status));
}

/** Tickets RUN d'Arthur à traiter (« A faire aujourd'hui », « A corriger », « Livraison KO ») sur un board RUN (éléments seulement). */
export async function runTicketsForArthur(board: Board, rb: RunBoard): Promise<Ticket[]> {
  const { cols, extra } = runColumns(await columnsOf(board.id), rb);
  if (!cols.status || !cols.people) {
    throw new Error(`board RUN ${board.id} : colonne « ${rb.statusTitle} » ou « ${rb.peopleTitle} » introuvable`);
  }
  return (await itemsForArthur(board.id, cols.people.id))
    .map((i) => toTicket(i, board, cols, extra))
    .filter((t) => isActiveStatus('run', t.status));
}

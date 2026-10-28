import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';

const SECRETS = join(homedir(), 'Library/CloudStorage/Dropbox/Ubuntu/home/.secrets');

export const WORK_DIR = '/Volumes/Work';
export const TIME_ZONE = 'Europe/Paris';
export const ARTHUR = { mondayId: 39652702, email: 'arandre@axome.com' };
export const RUN_BOARD_ID = 436291671;
export const IMPORTED_STATUSES = ['En cours', 'Planifié'];

/** RUN : seuls les tickets mis en « A faire aujourd'hui » par les chefs de projet sont importés. */
export const RUN_STATUS = "A faire aujourd'hui";

/** Statut de livraison : le travail d'Arthur est fait, l'issue passe en « Terminé ». */
const DELIVERED = /valider|validation|recette|r[ée]solu|cl[ôo]tur|termin[ée]|^valid[ée]$|passer en prod|projet livr/i;
/** Statut de reprise : le ticket revient à Axome (à corriger, question posée à Axome, en attente d'Axome, en retard). */
const REWORK = /corriger|correction|livraison ko|question pour axome|attente axome|en retard/i;

export const isDelivered = (status: string) => DELIVERED.test(status);

/** Ticket à traiter par Arthur : importé s'il n'existe pas, rouvert s'il était terminé ou annulé par l'import. */
export const isActiveStatus = (kind: 'build' | 'run', status: string) =>
  REWORK.test(status) || (kind === 'run' ? status === RUN_STATUS : IMPORTED_STATUSES.includes(status));

/** Boards RUN : titre de la colonne de statut, de la colonne où figure Arthur et, pour le board global, de la colonne client. */
export type RunBoard = { id: number; statusTitle: string; peopleTitle: string; clientTitle?: string };
export const RUN_BOARDS: RunBoard[] = [
  { id: 436291671, statusTitle: 'Statut interne', peopleTitle: 'Intervenant', clientTitle: 'Client (Zendesk)' },
  { id: 6028054939, statusTitle: 'Statut', peopleTitle: 'Dév/inté' }, // [SUIVI RUN] N LAB (Nutrimuscle)
  { id: 9020395385, statusTitle: 'Statut', peopleTitle: 'Dév' }, // [SUIVI] La Maison Convertible / Le Lit
];
export const runBoard = (id: number) => RUN_BOARDS.find((b) => b.id === id);
export const PROJECT_CODE = /P-AXO-\d{4}-\d{3}/;

export const ONBOARDING_AGENT = 'Mika';

export const MULTICA = {
  bin: '/Applications/Multica.app/Contents/Resources/app.asar.unpacked/resources/bin/multica',
  profile: 'desktop-api.multica.ai',
  workspaceId: '2c231b1f-bcb0-4583-a81c-79135be12a42',
};

/** Lit une clé d'un fichier .env sans jamais l'afficher. */
export function readSecret(file: string, key: string): string {
  const path = join(SECRETS, file);
  const line = readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith(`${key}=`))
    .pop();
  const value = line?.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
  if (!value) throw new Error(`${key} manquant dans ${path}`);
  return value;
}

export type RegistryClient = {
  slug: string;
  path: string;
  monday_boards?: number[];
  multica_project_id?: string;
  /** Identifiant de l’issue de configuration tant que le client n’est pas prêt (ex. AX-12). */
  setup?: string;
  /** Valeurs exactes de la colonne « Client (Zendesk) » du board RUN global qui désignent ce client. */
  run_aliases?: string[];
  /** Boards RUN dédiés à ce client (ex. [SUIVI RUN] N LAB). */
  run_boards?: number[];
};

export function loadRegistry(): RegistryClient[] {
  const doc = loadYaml(readFileSync(join(WORK_DIR, 'registry.yaml'), 'utf8')) as { clients: RegistryClient[] };
  return doc.clients;
}

/** Mots en minuscules sans accents ni ponctuation : « Neobulle (Atelier Bulle) » → « neobulle atelier bulle ». */
export const words = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function clientNames(client: RegistryClient): string[] {
  let name = '';
  try {
    name = (loadYaml(readFileSync(join(WORK_DIR, client.path, 'project.yaml'), 'utf8')) as { name?: string }).name ?? '';
  } catch {}
  return [client.slug, name].filter(Boolean);
}

/**
 * Clients du registre désignés par une valeur de « Client (Zendesk) ».
 * Un alias exact (run_aliases) l'emporte ; sinon le slug ou le nom doit apparaître en mots entiers,
 * ou être égal au texte une fois collé (« King d'Ultes » ↔ king-dultes). Plusieurs résultats = doute.
 */
export function matchRunClient(text: string, registry: RegistryClient[]): RegistryClient[] {
  const exact = registry.filter((c) => c.run_aliases?.some((a) => a.trim().toLowerCase() === text.trim().toLowerCase()));
  if (exact.length) return exact;
  const spaced = ` ${words(text)} `;
  const compact = spaced.replace(/ /g, '');
  return registry.filter((c) =>
    clientNames(c).some((n) => {
      const w = words(n);
      return w.length >= 3 && (spaced.includes(` ${w} `) || compact === w.replace(/ /g, ''));
    }),
  );
}

/** Retire la ligne `setup:` d'un client du registre (configuration terminée), sans toucher au reste du fichier. */
export function clearSetup(slug: string): void {
  const path = join(WORK_DIR, 'registry.yaml');
  const lines = readFileSync(path, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.trim() === `- slug: ${slug}`);
  if (start < 0) return;
  for (let i = start + 1; i < lines.length && !/^\s*- slug:/.test(lines[i]); i++) {
    if (/^\s+setup:/.test(lines[i])) {
      lines.splice(i, 1);
      break;
    }
  }
  writeFileSync(path, lines.join('\n'));
}

/** Date du jour au format YYYY-MM-DD dans le fuseau de Paris. */
export function parisDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(d);
}

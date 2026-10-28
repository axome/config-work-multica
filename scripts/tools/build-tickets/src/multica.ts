import { execFileSync } from 'node:child_process';
import { MULTICA, ONBOARDING_AGENT } from './config.ts';

/** Label posé sur une issue dont le ticket Monday a changé depuis l'import. */
export const LABEL_MONDAY_CHANGED = '4d5a0871-1f2d-4e9a-b149-cb434522f5d5';
/** Label des tickets de support importés des boards RUN. */
export const LABEL_RUN = '645ebe54-72d7-497d-adbf-428d5935a059';

export type Kind = 'build' | 'run';

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Appel du CLI multica. Une erreur passagère (réseau, API) est retentée deux fois, sauf pour une commande qui créerait
 * un doublon si le premier essai avait en fait abouti (`retry: false` : création d'issue, commentaire).
 * Le message d'erreur reprend la sortie d'erreur de multica.
 */
function run(args: string[], input?: string, retry = true): string {
  let last: { stderr?: string; message?: string } = {};
  for (let attempt = 1; attempt <= (retry ? 3 : 1); attempt++) {
    try {
      return execFileSync(MULTICA.bin, ['--profile', MULTICA.profile, '--workspace-id', MULTICA.workspaceId, ...args], {
        input,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      last = err as { stderr?: string; message?: string };
      // Erreur de l'appelant (argument invalide, ressource absente) : inutile de réessayer.
      if (/invalid|unknown (flag|command)|not found|required flag/i.test(String(last.stderr ?? ''))) break;
      if (attempt < 3 && retry) sleep(attempt * 1500);
    }
  }
  const detail = String(last.stderr || last.message || '').trim().split('\n').slice(-3).join(' ');
  throw new Error(`multica ${args.slice(0, 3).join(' ')} : ${detail}`);
}

export type ExistingIssue = { id: string; identifier: string; status: string };

export type ImportedIssue = ExistingIssue & {
  description: string;
  assignee_id: string | null;
  assignee_type?: string | null;
  created_at?: string;
  metadata: Record<string, string | number | boolean>;
};

/** Issue déjà importée pour cet item Monday (tous statuts, tous projets). */
export function findImported(mondayItemId: string): ImportedIssue | undefined {
  const out = JSON.parse(
    run(['issue', 'list', '--metadata', `monday_item_id=${mondayItemId}`, '--output', 'json', '--limit', '5',
      '--fields', 'id,identifier,status,description,assignee_id,assignee_type,metadata']),
  ) as { issues: ImportedIssue[] };
  return out.issues[0];
}

/**
 * Rouvre une issue terminée, ou annulée par l'import, quand son ticket redevient à traiter.
 * Elle est désassignée d'abord : aucun agent ne repart seul, Arthur réassigne pour relancer un cycle,
 * et le commentaire posté ensuite ne déclenche donc rien.
 */
export function reopen(issue: ImportedIssue, note: string, files: string[] = []): void {
  if (issue.assignee_id) run(['issue', 'assign', issue.id, '--unassign']);
  setStatus(issue.id, 'todo');
  setMetadata(issue.id, 'cancelled_by_import', false);
  setMetadata(issue.id, 'closed_by_import', false);
  comment(issue.id, note, files);
}

/** Un agent travaille-t-il en ce moment sur cette issue ? */
export function hasActiveRun(issueId: string): boolean {
  const out = run(['issue', 'runs', issueId, '--active', '--output', 'json']).trim();
  try {
    const runs = JSON.parse(out) as unknown[] | { runs?: unknown[] };
    return (Array.isArray(runs) ? runs : (runs.runs ?? [])).length > 0;
  } catch {
    return out.length > 2;
  }
}

/**
 * Commentaire posté sans relancer l'agent assigné : un commentaire relance toujours l'agent d'une issue,
 * même terminée. On désassigne, on commente, puis on réassigne le même agent avec --no-start.
 * Si l'agent travaille en ce moment, on ne touche à rien : renvoie false, et le suivi réessaiera au passage suivant.
 */
export function quietComment(issue: ImportedIssue, content: string, files: string[] = []): boolean {
  const agentId = issue.assignee_type === 'agent' ? issue.assignee_id : null;
  if (!agentId) {
    comment(issue.id, content, files);
    return true;
  }
  if (hasActiveRun(issue.id)) return false;
  run(['issue', 'assign', issue.id, '--unassign']);
  try {
    comment(issue.id, content, files);
  } finally {
    run(['issue', 'assign', issue.id, '--to-id', agentId, '--no-start']);
  }
  return true;
}

/** Le suivi rouvre sur un changement Monday une issue terminée, ou annulée par l'import (l'import du jour rouvre aussi celles annulées par Arthur). */
export const reopenable = (issue: ImportedIssue) =>
  issue.status === 'done' || (issue.status === 'cancelled' && issue.metadata?.cancelled_by_import === true);

/** Date (ISO) du dernier passage de l'issue dans ce statut (« Terminé », « Annulé », « À planifier »…), d'après son historique. */
export function movedToAt(issueId: string, status: string): string | undefined {
  const timeline = JSON.parse(run(['issue', 'timeline', issueId, '--output', 'json'])) as {
    action?: string;
    created_at: string;
    details?: { to?: string };
  }[];
  return timeline.filter((e) => e.action === 'status_changed' && e.details?.to === status).pop()?.created_at;
}

/** Issue de configuration déjà créée pour un client RUN inconnu (valeur normalisée de « Client (Zendesk) »). */
export function findRunClientOnboarding(normalizedClient: string): ExistingIssue | undefined {
  const out = JSON.parse(
    run(['issue', 'list', '--metadata', `onboarding_run_client=${normalizedClient}`, '--output', 'json', '--fields', 'id,identifier,status', '--limit', '5']),
  ) as { issues: ExistingIssue[] };
  return out.issues[0];
}

/** Issues importées de Monday encore ouvertes, plus les fermées depuis moins de 60 jours (pour les rouvrir au besoin). */
export function listImported(): ImportedIssue[] {
  const issues: ImportedIssue[] = [];
  const recent = Date.now() - 60 * 864e5;
  for (const status of ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled']) {
    const closed = status === 'done' || status === 'cancelled';
    for (let offset = 0; ; offset += 100) {
      const out = JSON.parse(
        run(['issue', 'list', '--status', status, '--output', 'json', '--limit', '100', '--offset', String(offset),
          '--fields', 'id,identifier,status,description,assignee_id,assignee_type,metadata,created_at,updated_at']),
      ) as { issues: (ImportedIssue & { updated_at: string })[]; has_more: boolean };
      issues.push(...out.issues.filter((i) => i.metadata?.monday_item_id !== undefined && (!closed || Date.parse(i.updated_at) >= recent)));
      if (!out.has_more) break;
    }
  }
  return issues;
}

export function setMetadata(issueId: string, key: string, value: string | number | boolean): void {
  const type = typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? 'number' : 'string';
  run(['issue', 'metadata', 'set', issueId, '--key', key, '--type', type, '--value', String(value)]);
}

export function updateDescription(issueId: string, description: string): void {
  run(['issue', 'update', issueId, '--description-stdin', '--output', 'json'], description);
}

export function addLabel(issueId: string, labelId: string): void {
  run(['issue', 'label', 'add', issueId, labelId]);
}

/** Commentaire, avec des fichiers locaux en pièces jointes (ajoutés en bas du commentaire par multica). */
export function comment(issueId: string, content: string, files: string[] = []): void {
  run(['issue', 'comment', 'add', issueId, '--content-stdin', ...(files.length ? ['--allow-external-file'] : []),
    ...files.flatMap((p) => ['--attachment', p]), '--output', 'json'], content, false);
}

export function setStatus(issueId: string, status: string): void {
  run(['issue', 'status', issueId, status]);
}

/** Statut d'une issue par son identifiant (ex. AX-5), ou undefined si elle n'existe pas. */
export function issueStatus(identifier: string): string | undefined {
  try {
    return (JSON.parse(run(['issue', 'get', identifier, '--output', 'json'])) as { status: string }).status;
  } catch {
    return undefined;
  }
}

/** Issue de configuration déjà créée pour ce board Monday (tous statuts). */
export function findOnboarding(boardId: number): ExistingIssue | undefined {
  const out = JSON.parse(
    run(['issue', 'list', '--metadata', `onboarding_board_id=${boardId}`, '--output', 'json', '--fields', 'id,identifier,status', '--limit', '5']),
  ) as { issues: ExistingIssue[] };
  return out.issues[0];
}

/** Issue « Nouveau projet », hors projet, assignée à l'agent de configuration : son travail démarre aussitôt. */
export function createOnboardingIssue(params: {
  title: string;
  description: string;
  boardUrl: string;
  boardId?: number;
  runClient?: string;
}): ExistingIssue {
  const issue = JSON.parse(
    run(
      ['issue', 'create', '--title', params.title, '--status', 'todo', '--assignee', ONBOARDING_AGENT,
        '--description-stdin', '--property', `Monday=${params.boardUrl}`, '--output', 'json'],
      params.description,
      false,
    ),
  ) as ExistingIssue;
  if (params.boardId) setMetadata(issue.id, 'onboarding_board_id', params.boardId);
  if (params.runClient) setMetadata(issue.id, 'onboarding_run_client', params.runClient);
  return issue;
}

export function createIssue(params: {
  projectId: string;
  title: string;
  description: string;
  mondayUrl: string;
  mondayItemId: string;
  mondayBoardId: number;
  mondayStatus: string;
  lastUpdateAt?: string;
  kind: Kind;
  priority?: string;
}): ExistingIssue {
  const issue = JSON.parse(
    run(
      ['issue', 'create', '--title', params.title, '--project', params.projectId, '--status', 'todo',
        ...(params.priority ? ['--priority', params.priority] : []),
        '--description-stdin', '--property', `Monday=${params.mondayUrl}`, '--output', 'json'],
      params.description,
      false,
    ),
  ) as ExistingIssue;
  setMetadata(issue.id, 'monday_kind', params.kind);
  if (params.kind === 'run') addLabel(issue.id, LABEL_RUN);
  setMetadata(issue.id, 'monday_item_id', Number(params.mondayItemId));
  setMetadata(issue.id, 'monday_board_id', params.mondayBoardId);
  setMetadata(issue.id, 'monday_status', params.mondayStatus);
  setMetadata(issue.id, 'monday_assigned', true);
  setMetadata(issue.id, 'monday_last_update_at', params.lastUpdateAt ?? new Date().toISOString());
  return issue;
}

/** Issue par son identifiant (ex. AX-18), avec sa description et ses métadonnées. */
export function getIssue(identifier: string): ImportedIssue | undefined {
  try {
    return JSON.parse(run(['issue', 'get', identifier, '--output', 'json'])) as ImportedIssue;
  } catch {
    return undefined;
  }
}

/**
 * Joint des fichiers locaux à une issue et renvoie leurs références Markdown, dans l'ordre des fichiers
 * (`![nom](url)` pour une image, `!file[nom](url)` sinon). multica les ajoute en fin de description :
 * l'appelant réécrit ensuite la description pour les placer au bon endroit.
 */
export function attachFiles(issueId: string, paths: string[]): string[] {
  run(['issue', 'update', issueId, '--allow-external-file', ...paths.flatMap((p) => ['--attachment', p]), '--output', 'json'], undefined, false);
  const issue = JSON.parse(run(['issue', 'get', issueId, '--output', 'json'])) as { description: string };
  const refs = issue.description.match(/!(?:file)?\[[^\]]*\]\(https:\/\/[^)]*\/api\/attachments\/[^)]+\)/g) ?? [];
  return refs.slice(-paths.length);
}

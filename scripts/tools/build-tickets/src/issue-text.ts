// Texte des issues créées par l'import : description d'un ticket, agent suggéré, priorité, issues de configuration.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { fileLines, type AssetRefs } from './attachments.ts';
import { WORK_DIR, parisDate, type RegistryClient } from './config.ts';
import { allMessages, type Board, type Message, type Thread, type Ticket } from './monday.ts';
import type { Kind } from './multica.ts';

export type Agent = { agent: string; reason: string };

export function repoKinds(client: RegistryClient): string[] {
  try {
    const project = loadYaml(readFileSync(join(WORK_DIR, client.path, 'project.yaml'), 'utf8')) as { repos?: { kind?: string }[] };
    return (project.repos ?? []).map((r) => r.kind ?? '');
  } catch {
    return [];
  }
}

/** Agent suggéré : d'abord le groupe Monday, puis les mots du ticket, puis les types de repos du client. */
export function suggestAgent(ticket: Ticket, kinds: string[]): Agent {
  const rules: [string, RegExp][] = [
    ['migration', /migration|reprise (des|de l')|historique/i],
    ['flux-dev', /\bflux\b|erp|sftp|\bftp\b|webhook|make|n8n|axflux|polaris|middleware|synchro|\bsync|stock|export|import|api\b/i],
    ['theme-dev', /thème|theme|section|template|liquid|\bpages?\b|header|footer|menu|css|maquette|front|pdp|plp|panier|side ?cart|responsive|mobile|affichage/i],
    ['shopify-dev', /\bapp\b|extension|checkout|function|discount|remise|promo|admin|metafield|metaobje|b2b|market|abonnement/i],
  ];
  for (const [agent, re] of rules) if (ticket.group && re.test(ticket.group)) return { agent, reason: `groupe « ${ticket.group} »` };
  const words = `${ticket.parent ?? ''} ${ticket.name}`;
  for (const [agent, re] of rules) if (re.test(words)) return { agent, reason: 'intitulé du ticket' };
  if (kinds.length && kinds.every((k) => /axflux|make|n8n|scripts|dolibarr/.test(k))) return { agent: 'flux-dev', reason: 'repos du client (flux)' };
  if (kinds.length && kinds.every((k) => k === 'theme')) return { agent: 'theme-dev', reason: 'repos du client (thème)' };
  return { agent: 'shopify-dev', reason: 'par défaut' };
}

/** Priorité multica à partir de la priorité Monday / Zendesk (Urgente, Élevée, P1, critical…). */
export function priorityOf(label?: string): string | undefined {
  if (!label) return undefined;
  const l = label.toLowerCase();
  if (/urgent|critical|^p1$/.test(l)) return 'urgent';
  if (/lev[ée]e|high|^p2$/.test(l)) return 'high';
  if (/normal|medium|^p3$/.test(l)) return 'medium';
  if (/basse|low/.test(l)) return 'low';
  return undefined;
}

/**
 * Une mise à jour Monday qui semble contenir des accès (mot de passe, identifiants, jeton, clé) n'est jamais recopiée :
 * multica est un service externe et les secrets n'ont rien à faire dans une issue. Les jetons isolés sont aussi masqués.
 */
const SECRET_HINT = /mot de passe|password|passwd|\bmdp\b|\bpwd\b|identifiants?\b|\bacc[eè]s\b/i;
const SECRET_VALUE = /\b(shpat_|shpss_|shppa_|ghp_|gho_|github_pat_|sk-|xox[bp]-)[A-Za-z0-9_-]{8,}|\b[A-Za-z0-9_-]{32,}\b/g;
export function redactUpdate(text: string): string {
  if (SECRET_HINT.test(text)) return '[mise à jour masquée : elle semble contenir des accès ou des secrets, à lire directement dans le ticket Monday]';
  return text.replace(SECRET_VALUE, '[masqué]');
}

/** Colonne lien Monday : « 93137 - https://… » → libellé et URL. */
export function splitLink(value?: string): { label?: string; url?: string } {
  if (!value) return {};
  const url = value.match(/https?:\/\/\S+/)?.[0];
  const label = url ? value.replace(url, '').replace(/\s*-\s*$/, '').trim() : value;
  return { label: label || undefined, url };
}

export const ticketTitle = (ticket: Ticket, kind: Kind) =>
  `${kind === 'run' ? '[RUN] ' : ''}${ticket.parent ? `${ticket.parent} › ` : ''}${ticket.name}`;

export function describeTicket(
  ticket: Ticket,
  agent: Agent,
  kind: Kind,
  origin: string,
  importedOn = parisDate(new Date()),
  refs: AssetRefs = {},
): string {
  const f = ticket.fields;
  const zendesk = splitLink(f.zendeskUrl);
  const meta = [
    `**Type** : ${kind === 'run' ? 'RUN (support)' : 'BUILD (projet)'}`,
    `**Board** : ${ticket.board.name}`,
    f.client && `**Client (Zendesk)** : ${f.client}`,
    f.site && `**Site** : ${f.site}`,
    ticket.group && `**Groupe** : ${ticket.group}`,
    ticket.parent && `**Élément parent** : ${ticket.parent}`,
    `**Statut Monday** : ${ticket.status}`,
    f.priority && `**Priorité** : ${f.priority}`,
    (f.zendesk || zendesk.url) && `**Ticket Zendesk** : ${zendesk.url ? `[${f.zendesk ?? zendesk.label ?? 'lien'}](${zendesk.url})` : f.zendesk}`,
    f.planned && `**Date planifiée** : ${f.planned}`,
    f.deadline && `**Deadline** : ${f.deadline}`,
    ticket.timeline && `**Période** : ${ticket.timeline}`,
    f.cdp && `**Chef de projet** : ${f.cdp}`,
    ticket.people && `**Personnes** : ${ticket.people}`,
  ].filter(Boolean);
  const lines = [`Ticket Monday : [${ticket.name}](${ticket.url})`, '', ...meta.map((m) => `- ${m}`)];
  if (ticket.subitems.length) {
    lines.push('', '## Sous-éléments', ...ticket.subitems.map((s) => `- ${s.name}${s.status ? ` (${s.status})` : ''}${s.people ? `, ${s.people}` : ''}`));
  }
  if (ticket.files.length) lines.push('', '## Fichiers du ticket', '', ...fileLines(ticket.files, refs));
  lines.push(...describeExchanges(ticket.threads, refs));
  lines.push(
    '',
    '---',
    `Agent suggéré : **${agent.agent}** (${agent.reason}). Assigner l'issue à un agent pour démarrer l'analyse.`,
    `Importé le ${importedOn} depuis ${origin}. Monday est en lecture seule pour multica${kind === 'run' ? ', et Zendesk n\'est pas consulté' : ''}.`,
  );
  return lines.join('\n');
}

/** Date et heure de Paris : « 2026-10-15 17:47 ». */
export const parisDateTime = (iso: string) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

const MAX_MESSAGE = 6000;
const quote = (text: string) => redactUpdate(text).slice(0, MAX_MESSAGE).split('\n').map((l) => `> ${l}`);

/**
 * Échanges Monday dans l'ordre de Monday : fils du plus récent au plus ancien, réponses dans l'ordre chronologique.
 * Le dernier message est signalé en tête (sans recopier son texte) et marqué ⭐ dans le fil : c'est souvent lui
 * qui porte la décision (correctif retenu, périmètre).
 */
export function describeExchanges(threads: Thread[], refs: AssetRefs = {}): string[] {
  if (!threads.length) return [];
  const all = allMessages(threads);
  const last = all[all.length - 1];
  const lines = [
    '',
    '## Échanges Monday',
    '',
    'Ordre de Monday : fils du plus récent au plus ancien, réponses dans l\'ordre chronologique. Les derniers messages d\'Arthur et du chef de projet font foi (solution retenue, périmètre).',
  ];
  if (all.length > 1) {
    const parent = threads.find((t) => t.replies.includes(last));
    const where = parent ? `réponse dans le fil du ${parisDateTime(parent.date)}` : 'message principal du premier fil';
    lines.push('', `**Dernier message** : ${last.author}, ${parisDateTime(last.date)} (${where}, marqué ⭐ ci-dessous).`);
  }
  const star = (m: Message) => (all.length > 1 && m === last ? ' ⭐ dernier message' : '');
  for (const t of threads) {
    lines.push('', `### Fil du ${parisDateTime(t.date)} : ${t.author}${star(t)}`, '', ...quote(t.text));
    if (t.files.length) lines.push('', `Fichiers partagés dans ce message (${t.files.length}) :`, '', ...fileLines(t.files, refs));
    for (const r of t.replies) lines.push('', `**↳ Réponse de ${r.author}, ${parisDateTime(r.date)}${star(r)}**`, '', ...quote(r.text));
  }
  return lines;
}

const ticketList = (tickets: Ticket[]) =>
  tickets.length ? tickets.map((t) => `- ${t.parent ? `${t.parent} › ` : ''}${t.name} (${t.status})`) : ['- aucun pour l\'instant'];

export function describeNewBoard(board: Board, details: { description: string; url: string }, tickets: Ticket[], kind: Kind, origin: string): string {
  const code = board.name.match(/P-AXO-\d{4}-\d{3}/)?.[0];
  const lines = [
    `Board Monday ${kind === 'run' ? 'RUN ' : ''}sans client dans /Volumes/Work/registry.yaml : [${board.name}](${details.url})`,
    '',
    `- **ID du board** : ${board.id}`,
    code && `- **Code projet** : ${code}`,
    `- **Type** : ${kind === 'run' ? 'board RUN dédié à un client (à ajouter dans `run_boards` du client)' : 'board de projet BUILD (à ajouter dans `monday_boards` du client)'}`,
    `- **Origine** : ${origin}`,
  ].filter((l): l is string => typeof l === 'string');
  if (details.description.trim()) lines.push('', '## Description du board', '', details.description.trim());
  lines.push('', '## Tickets d\'Arthur en attente sur ce board', ...ticketList(tickets));
  lines.push(
    '',
    '---',
    'Suivre le skill **axome-client-onboarding** : rattacher le board à un client existant si c\'est évident, sinon préparer le dossier client et le projet multica, puis passer l\'issue en « Bloqué » avec la liste des actions pour Arthur.',
    `Les tickets de ce board seront importés quand la configuration sera terminée. Créé le ${parisDate(new Date())} par l\'import des tickets.`,
  );
  return lines.join('\n');
}

export function describeNewRunClient(clientText: string, tickets: Ticket[], candidates: string[], origin: string): string {
  const lines = [
    `Client RUN sans dossier : la colonne « Client (Zendesk) » du board [RUN] Axome Maintenance vaut **« ${clientText} »**, et aucun client de /Volumes/Work/registry.yaml ne lui correspond${candidates.length ? ' de façon sûre' : ''}.`,
    '',
    candidates.length ? `- **Clients candidats (doute)** : ${candidates.join(', ')}` : '- **Clients candidats** : aucun',
    `- **Origine** : ${origin}`,
    '',
    '## Tickets RUN d\'Arthur en attente pour ce client',
    ...ticketList(tickets),
    '',
    '---',
    `Suivre le skill **axome-client-onboarding** (cas d'un client RUN) : si c'est un client existant, ajouter « ${clientText} » dans ses \`run_aliases\` ; sinon créer le client avec \`run_aliases: ["${clientText}"]\`, puis passer l'issue en « Bloqué » avec la liste des actions pour Arthur.`,
    `Les tickets de ce client seront importés quand la configuration sera terminée. Créé le ${parisDate(new Date())} par l'import des tickets RUN.`,
  ];
  return lines.join('\n');
}

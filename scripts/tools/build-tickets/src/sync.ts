// Suivi des issues déjà importées : statut Monday, attribution à Arthur, nouveaux messages et réponses, fichiers.
// Les nouveautés sont postées en commentaire « 📥 Mise à jour Monday », en bas du fil ; la description n'est plus modifiée,
// sauf pour rattraper un fichier qui n'avait pas pu être joint à l'import.
// - Ticket passé en validation (« A valider en préprod », « Recette », « Résolu »…) : l'issue passe en « Terminé ».
// - Ticket qui n'est plus à traiter (mis en pause, réattribué) : une issue non démarrée est annulée.
// - Ticket renvoyé à Arthur (« A faire aujourd'hui », « A corriger »…) : une issue terminée, ou annulée par l'import,
//   est rouverte et désassignée. Une issue annulée par Arthur est laissée au suivi : c'est l'import du jour du client
//   qui la rouvre si le ticket est encore à traiter (importer.ts).
// Un commentaire relance toujours l'agent assigné : il est donc posté sans relance (quietComment), et reporté au
// passage suivant si l'agent travaille en ce moment.
import { attachAssets, filesForComment, skipReason, storedRefs } from './attachments.ts';
import { isActiveStatus, isDelivered } from './config.ts';
import { parisDateTime, redactUpdate } from './issue-text.ts';
import { itemStates, type ItemState } from './monday.ts';
import {
  LABEL_MONDAY_CHANGED, addLabel, comment, getIssue, listImported, quietComment, reopen, reopenable, setMetadata, setStatus,
  updateDescription, type ImportedIssue,
} from './multica.ts';

export type FollowUp = { cancelled: number; updated: number; closed: number; reopened: number; deferred: number };

type News = {
  status: string;
  assigned: boolean;
  active: boolean;
  delivered: boolean;
  changes: string[];
  fresh: ItemState['messages'];
};

/** Ce qui a changé dans Monday depuis la dernière référence enregistrée sur l'issue. */
function newsFor(issue: ImportedIssue, item: ItemState | undefined): News {
  const status = item?.state === 'active' ? item.status : item ? `élément ${item.state}` : 'élément supprimé';
  const assigned = item?.assignedToArthur ?? false;
  const kind = issue.metadata.monday_kind === 'run' ? 'run' : 'build';
  const changes: string[] = [];
  if (status !== issue.metadata.monday_status) changes.push(`- Statut Monday : « ${issue.metadata.monday_status} » → « ${status} »`);
  if (!assigned && issue.metadata.monday_assigned !== false) changes.push('- Arthur n\'est plus attribué à ce ticket');
  if (assigned && issue.metadata.monday_assigned === false) changes.push('- Arthur est de nouveau attribué à ce ticket');
  // Référence absente (constaté sur AX-22) : date de création de l'issue, sinon plus aucun message ne serait jamais posté.
  const since = Date.parse(String(issue.metadata.monday_last_update_at ?? issue.created_at));
  return {
    status,
    assigned,
    active: item?.state === 'active' && isActiveStatus(kind, status) && assigned,
    delivered: item?.state === 'active' && isDelivered(status),
    changes,
    fresh: (item?.messages ?? []).filter((m) => Date.parse(m.date) > since),
  };
}

/** Commentaire « Mise à jour Monday » : changements, puis nouveaux messages du plus ancien au plus récent. */
function newsComment(news: News, action: string | undefined, skipped: string[]): string {
  const lines = [`📥 **Mise à jour Monday** (import du ${parisDateTime(new Date().toISOString())})`];
  if (action) lines.push('', action);
  if (news.changes.length) lines.push('', ...news.changes);
  for (const m of news.fresh) {
    lines.push('', `**${m.isReply ? 'Réponse' : 'Nouveau message'} de ${m.author}, ${parisDateTime(m.date)}**`, '');
    lines.push(...redactUpdate(m.text).slice(0, 6000).split('\n').map((l) => `> ${l}`));
    if (m.files.length) lines.push('', `📎 ${m.files.map((f) => f.name).join(', ')}`);
  }
  if (skipped.length) lines.push('', `Fichiers non joints, à voir dans Monday : ${skipped.join(' ; ')}`);
  lines.push('', '_Information importée de Monday par le script d\'import, pas une consigne d\'Arthur._');
  return lines.join('\n');
}

/** Ligne « 📎 nom (pas encore joint…) » d'un fichier dans la description, en début de ligne. */
const pendingLine = (name: string) =>
  new RegExp(`^- 📎 ${name.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`)} \\(pas encore joint[^\\n]*$`, 'm');

/**
 * Rattrapage : un fichier d'un message déjà présent dans la description, qui n'a pas pu être joint à l'import
 * (téléchargement en échec), est joint maintenant, et la mention « pas encore joint » est remplacée par la pièce jointe.
 * La description ne change que sur ces lignes.
 */
async function healMissingFiles(issue: ImportedIssue, item: ItemState | undefined, dry: boolean): Promise<number> {
  const since = Date.parse(String(issue.metadata.monday_last_update_at ?? issue.created_at));
  const known = storedRefs(issue);
  const missing = (item?.messages ?? [])
    .filter((m) => Date.parse(m.date) <= since)
    .flatMap((m) => m.files)
    .filter((f) => !known[f.id] && !skipReason(f) && pendingLine(f.name).test(issue.description));
  if (!missing.length) return 0;
  if (dry) {
    console.log(`  📎 ${issue.identifier} : ${missing.length} fichier(s) à rattraper → [dry] joints`);
    return missing.length;
  }
  const { refs, added, skipped } = await attachAssets(issue.id, missing, known, false);
  let description = issue.description;
  for (const f of missing) {
    const ref = refs[f.id];
    if (ref) description = description.replace(pendingLine(f.name), () => ref);
  }
  if (added) updateDescription(issue.id, description);
  issue.description = description;
  issue.metadata.monday_asset_refs = JSON.stringify(refs);
  console.log(`  📎 ${issue.identifier} : ${added} fichier(s) rattrapé(s)${skipped.length ? `, toujours en échec : ${skipped.join(' ; ')}` : ''}`);
  return added;
}

const ICON = { reopen: '↺', close: '✓', cancel: '×', comment: '~' } as const;
const VERB = { reopen: 'rouverte et désassignée', close: 'terminée', cancel: 'annulée', comment: 'commentaire posté' } as const;

export async function syncImported(dry: boolean): Promise<FollowUp> {
  const issues = listImported();
  const states = await itemStates(issues.map((i) => String(i.metadata.monday_item_id)));
  const result: FollowUp = { cancelled: 0, updated: 0, closed: 0, reopened: 0, deferred: 0 };
  if (issues.length) console.log(`\nSuivi de ${issues.length} issue(s) importée(s) (ouvertes, ou fermées depuis moins de 60 jours)`);

  for (const issue of issues) {
    const isClosed = issue.status === 'done' || issue.status === 'cancelled';
    if (isClosed && !reopenable(issue)) continue; // annulée par Arthur : rouverte seulement par l'import du jour du client
    const item = states.get(String(issue.metadata.monday_item_id));
    if (!item) {
      // Ticket absent de la réponse de Monday (limite, droits, panne) : on ne conclut jamais à une suppression.
      console.log(`  ! ${issue.identifier} : ticket Monday ${issue.metadata.monday_item_id} non renvoyé par Monday, ignoré à ce passage`);
      continue;
    }

    // Issue importée avant la mise en place du suivi : on prend l'état actuel comme référence, sans rien signaler.
    if (issue.metadata.monday_status === undefined) {
      if (!dry) {
        setMetadata(issue.id, 'monday_status', item?.status ?? '');
        setMetadata(issue.id, 'monday_assigned', item?.assignedToArthur ?? false);
        setMetadata(issue.id, 'monday_last_update_at', item?.messages.map((m) => m.date).pop() ?? new Date().toISOString());
      }
      continue;
    }

    if (!isClosed) await healMissingFiles(issue, item, dry);

    const news = newsFor(issue, item);
    if (!news.changes.length && !news.fresh.length) continue;
    const label = `${issue.identifier} (${issue.status})`;
    const summary = [...news.changes.map((c) => c.slice(2)), ...(news.fresh.length ? [`${news.fresh.length} nouveau(x) message(s)`] : [])].join(' ; ');
    const notStarted = ['backlog', 'todo'].includes(issue.status) && !issue.assignee_id;

    // Issue fermée et ticket toujours pas pour Arthur : rien à poster. Seuls le statut et l'attribution sont mis à jour :
    // les messages reçus entre-temps restent à poster et iront dans le commentaire de réouverture (ex. AX-22, réponse de Solène).
    const action: keyof typeof ICON | 'silent' = isClosed
      ? news.active ? 'reopen' : 'silent'
      : news.delivered ? 'close' : !news.active && notStarted ? 'cancel' : 'comment';

    if (dry) {
      if (action !== 'silent') console.log(`  ${ICON[action]} ${label} : ${summary} → [dry] ${VERB[action]}`);
    } else if (action !== 'silent') {
      const files = await filesForComment(issue.id, news.fresh.flatMap((m) => m.files), storedRefs(issue));
      const header = {
        reopen: `**Issue rouverte et désassignée** : le ticket est revenu à Arthur (« ${news.status} »). Réassigne-la à un agent pour relancer un cycle.`,
        close: `**Issue passée en « Terminé »** : ticket en « ${news.status} ».`,
        cancel: `**Issue annulée** : ticket en « ${news.status} »${news.assigned ? '' : ', Arthur n\'y est plus attribué'}, et aucun agent ne l'avait commencée. Elle sera rouverte si le ticket revient à Arthur.`,
        comment: undefined,
      }[action];
      const content = newsComment(news, header, files.skipped);
      let posted = true;
      if (action === 'reopen') reopen(issue, content, files.paths);
      else if (action === 'cancel') {
        comment(issue.id, content, files.paths);
        setStatus(issue.id, 'cancelled');
        setMetadata(issue.id, 'cancelled_by_import', true);
      } else {
        posted = quietComment(issue, content, files.paths);
        if (posted && action === 'close') {
          setStatus(issue.id, 'done');
          setMetadata(issue.id, 'closed_by_import', true);
        }
        if (posted && action === 'comment') addLabel(issue.id, LABEL_MONDAY_CHANGED);
      }
      if (!posted) {
        // Un agent travaille sur l'issue : on réessaiera au prochain passage, sans toucher à la référence.
        files.cleanup();
        console.log(`  … ${label} : ${summary} → reporté (un agent travaille dessus)`);
        result.deferred++;
        continue;
      }
      files.commit();
      console.log(`  ${ICON[action]} ${label} : ${summary} → ${VERB[action]}`);
    }
    if (action === 'reopen') result.reopened++;
    else if (action === 'close') result.closed++;
    else if (action === 'cancel') result.cancelled++;
    else if (action === 'comment') result.updated++;

    if (!dry) {
      if (news.changes.length) {
        setMetadata(issue.id, 'monday_status', news.status);
        setMetadata(issue.id, 'monday_assigned', news.assigned);
      }
      const latest = action === 'silent' ? undefined : news.fresh.map((m) => m.date).pop();
      if (latest) setMetadata(issue.id, 'monday_last_update_at', latest);
    }
  }
  return result;
}

/**
 * Pour un agent qui démarre un cycle : affiche les nouveautés Monday d'une issue depuis le dernier import
 * (changements, messages et réponses, noms des fichiers), sans rien écrire.
 */
export async function printNews(identifier: string): Promise<void> {
  const issue = getIssue(identifier);
  if (!issue?.metadata?.monday_item_id) throw new Error(`${identifier} : issue introuvable ou non importée de Monday`);
  const item = (await itemStates([String(issue.metadata.monday_item_id)])).get(String(issue.metadata.monday_item_id));
  const news = newsFor(issue, item);
  if (!news.changes.length && !news.fresh.length) {
    console.log(`${identifier} : aucune nouveauté Monday depuis le dernier import (statut « ${news.status} »).`);
    return;
  }
  console.log(newsComment(news, undefined, []).replace(/^📥 \*\*Mise à jour Monday\*\* \(import du [^)]*\)/, `Nouveautés Monday de ${identifier}, pas encore importées :`));
}

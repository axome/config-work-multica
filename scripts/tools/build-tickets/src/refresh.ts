// Rafraîchit la description d'issues déjà importées à partir de Monday (échanges complets, colonnes à jour),
// en gardant la date et l'origine de l'import ainsi que la section « Changements Monday depuis l'import ».
// Elle s'arrête à la date de l'import (métadonnée monday_last_update_at) : la suite arrive en commentaires.
import { attachAssets, storedRefs } from './attachments.ts';
import { loadRegistry } from './config.ts';
import { describeTicket, repoKinds, suggestAgent } from './issue-text.ts';
import { ticketsByIds } from './monday.ts';
import { getIssue, listImported, setMetadata, updateDescription, type ImportedIssue } from './multica.ts';

const CHANGES = "## Changements Monday depuis l'import";

export async function refreshIssues(which: string, dry: boolean): Promise<void> {
  const issues: ImportedIssue[] =
    which === 'tout'
      ? listImported().filter((i) => !['done', 'cancelled'].includes(i.status))
      : which.split(',').map((id) => id.trim()).filter(Boolean).map((id) => {
          const issue = getIssue(id);
          if (!issue) throw new Error(`issue ${id} introuvable`);
          return issue;
        });
  const imported = issues.filter((i) => i.metadata?.monday_item_id !== undefined);
  const tickets = new Map((await ticketsByIds(imported.map((i) => String(i.metadata.monday_item_id)))).map((t) => [t.itemId, t]));
  const registry = loadRegistry();
  console.log(`Rafraîchissement de ${imported.length} issue(s)`);
  for (const issue of imported) {
    const ticket = tickets.get(String(issue.metadata.monday_item_id));
    const label = `${issue.identifier ?? issue.id} (${issue.status})`;
    if (!ticket) {
      console.log(`  ! ${label} : ticket Monday introuvable, description laissée telle quelle`);
      continue;
    }
    const kind = issue.metadata.monday_kind === 'run' ? 'run' : 'build';
    const footer = issue.description.match(/Importé le (\S+) depuis (.+?)\. Monday est en lecture seule/);
    const client = registry.find((c) => c.monday_boards?.includes(ticket.board.id) || c.run_boards?.includes(ticket.board.id) ||
      (ticket.fields.client && c.run_aliases?.includes(ticket.fields.client)));
    const agent = suggestAgent(ticket, client ? repoKinds(client) : []);
    const changes = issue.description.indexOf(CHANGES);
    // Les messages postérieurs à l'import arrivent en commentaires « Mise à jour Monday » : la description s'arrête à l'import.
    const cutoff = Date.parse(String(issue.metadata.monday_last_update_at ?? ''));
    if (!Number.isNaN(cutoff)) {
      ticket.threads = ticket.threads
        .filter((t) => Date.parse(t.date) <= cutoff)
        .map((t) => ({ ...t, replies: t.replies.filter((r) => Date.parse(r.date) <= cutoff) }));
    }
    // Fichiers Monday : on joint ceux qui manquent, les autres gardent leur pièce jointe existante.
    const assets = [...ticket.files, ...ticket.threads.flatMap((t) => t.files)];
    const { refs, added, skipped } = await attachAssets(issue.id, assets, storedRefs(issue), dry);
    const description =
      describeTicket(ticket, agent, kind, footer?.[2] ?? 'un import précédent', footer?.[1], refs) +
      (changes >= 0 ? `\n\n${issue.description.slice(changes).trimEnd()}` : '');
    const messages = ticket.threads.flatMap((t) => [t, ...t.replies]).length;
    const files = assets.length ? `, ${added} fichier(s) ${dry ? 'à joindre' : 'joint(s)'}${skipped.length ? `, ${skipped.length} non joint(s)` : ''}` : '';
    console.log(`  ⟳ ${label} : ${ticket.threads.length} fil(s), ${messages} message(s)${files} → ${dry ? '[dry] ' : ''}description rafraîchie`);
    if (!dry) {
      updateDescription(issue.id, description);
    }
  }
}

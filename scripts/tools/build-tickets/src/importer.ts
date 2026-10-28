// Import commun BUILD / RUN : client prêt ou en configuration, création des issues, dédoublonnage et réouverture.
import { attachAssets } from './attachments.ts';
import { clearSetup, parisDate, type RegistryClient } from './config.ts';
import { describeTicket, priorityOf, repoKinds, suggestAgent, ticketTitle } from './issue-text.ts';
import type { Ticket } from './monday.ts';
import { createIssue, findImported, issueStatus, movedToAt, reopen, updateDescription, type Kind } from './multica.ts';

export type Summary = { created: number; existing: number; reopened: number; newClients: number; waiting: number };
export const newSummary = (): Summary => ({ created: 0, existing: 0, reopened: 0, newClients: 0, waiting: 0 });

/**
 * Un client en configuration (setup) est prêt dès que son issue de configuration est terminée :
 * « config ok » ou fermeture par Arthur. On retire alors setup du registre. Sinon ses tickets attendent.
 */
export function clientReady(client: RegistryClient, label: string, dry: boolean, summary: Summary): boolean {
  if (!client.setup) return true;
  const status = issueStatus(client.setup);
  if (status === 'done') {
    console.log(`\n${label} → ${client.slug} : configuration ${client.setup} terminée, ${dry ? '[dry] setup à retirer' : 'setup retiré du registre'}`);
    if (!dry) {
      clearSetup(client.slug);
      delete client.setup;
    }
    return true;
  }
  const why = status === 'cancelled' ? 'annulée, le client reste en attente' : `statut ${status ?? 'introuvable'}`;
  console.log(`\n${label} → ${client.slug} : client en configuration (${client.setup}, ${why}), tickets en attente`);
  summary.waiting++;
  return false;
}

/**
 * Crée les issues des tickets d'un client prêt ; remet en « À faire » celles fermées ou mises « À planifier »
 * un jour précédent alors que le ticket est encore à traiter.
 */
export async function importTickets(tickets: Ticket[], client: RegistryClient, kind: Kind, origin: string, dry: boolean, summary: Summary): Promise<void> {
  for (const ticket of tickets) {
    const title = ticketTitle(ticket, kind);
    const existing = findImported(ticket.itemId);
    if (existing) {
      const parked = ['done', 'cancelled', 'backlog'].includes(existing.status);
      const parkedOn = parked ? movedToAt(existing.id, existing.status) : undefined;
      if (parked && parkedOn && parisDate(new Date(parkedOn)) === parisDate(new Date())) {
        // Fermée ou mise « À planifier » aujourd'hui (par Arthur ou par le suivi) : laissée ainsi jusqu'au prochain jour de ce client (choix d'Arthur).
        console.log(`  = ${title} : déjà importé, mis de côté aujourd'hui (${existing.identifier}, ${existing.status})`);
        summary.existing++;
      } else if (parked) {
        // Terminée, annulée ou mise « À planifier » un jour précédent (par Arthur faute de temps, ou par l'import) et toujours
        // à traiter dans Monday le jour du client : l'import la remet en « À faire » (demandes d'Arthur, 2026-10-20 et 2026-10-27).
        const was = { done: 'terminée', cancelled: 'annulée', backlog: 'mise « À planifier »' }[existing.status as 'done' | 'cancelled' | 'backlog'];
        console.log(`  ↺ ${existing.identifier} ${title} : ${was}, à traiter aujourd'hui (« ${ticket.status} ») → ${dry ? '[dry] ' : ''}remise en « À faire »`);
        if (!dry) reopen(existing, `Ticket toujours à traiter dans Monday (« ${ticket.status} ») : issue ${was} un jour précédent, remise en « À faire » par l'import du jour.`);
        summary.reopened++;
      } else {
        console.log(`  = ${title} : déjà importé (${existing.identifier}, ${existing.status})`);
        summary.existing++;
      }
      continue;
    }
    const agent = suggestAgent(ticket, repoKinds(client));
    const priority = priorityOf(ticket.fields.priority);
    const assets = [...ticket.files, ...ticket.threads.flatMap((t) => t.files)];
    if (dry) {
      const files = assets.length ? `, ${assets.length} fichier(s) Monday` : '';
      console.log(`  + [dry] ${title} (${ticket.status}${priority ? `, priorité ${priority}` : ''}, agent suggéré ${agent.agent}${files})`);
      summary.created++;
      continue;
    }
    const issue = createIssue({
      projectId: client.multica_project_id!,
      title,
      description: describeTicket(ticket, agent, kind, origin),
      mondayUrl: ticket.url,
      mondayItemId: ticket.itemId,
      mondayBoardId: ticket.board.id,
      mondayStatus: ticket.status,
      lastUpdateAt: ticket.lastUpdateAt,
      kind,
      priority,
    });
    let files = '';
    if (assets.length) {
      // Fichiers Monday joints à l'issue, puis description réécrite pour les placer sous leurs messages.
      const { refs, added, skipped } = await attachAssets(issue.id, assets, {}, false);
      updateDescription(issue.id, describeTicket(ticket, agent, kind, origin, undefined, refs));
      files = `, ${added} fichier(s) joint(s)${skipped.length ? `, non joint(s) : ${skipped.join(' ; ')}` : ''}`;
    }
    console.log(`  + ${issue.identifier} ${title} (${ticket.status}${priority ? `, priorité ${priority}` : ''}, agent suggéré ${agent.agent}${files})`);
    summary.created++;
  }
}

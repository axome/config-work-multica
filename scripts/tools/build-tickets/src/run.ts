// Import RUN : tickets d'Arthur en « A faire aujourd'hui » sur les boards RUN (global et dédiés), rangés par client.
// Board global : client trouvé par la colonne « Client (Zendesk) » ; board dédié : client qui le déclare dans run_boards.
// Client inconnu ou douteux : issue de configuration confiée à Mika, une seule fois, et tickets en attente.
import { RUN_BOARDS, matchRunClient, words, type RegistryClient } from './config.ts';
import { clientReady, importTickets, type Summary } from './importer.ts';
import { describeNewBoard, describeNewRunClient } from './issue-text.ts';
import { boardDetails, runTicketsForArthur, type Board, type Ticket } from './monday.ts';
import { createOnboardingIssue, findOnboarding, findRunClientOnboarding } from './multica.ts';

export async function importRun(params: { registry: RegistryClient[]; boards: Board[]; origin: string; dry: boolean; summary: Summary }) {
  const { registry, boards, origin, dry, summary } = params;
  for (const rb of RUN_BOARDS) {
    const board = boards.find((b) => b.id === rb.id) ?? { id: rb.id, name: `board ${rb.id}` };
    const tickets = await runTicketsForArthur(board, rb);
    console.log(`\n${board.name} : ${tickets.length} ticket(s) d'Arthur à traiter (A faire aujourd'hui, A corriger, Livraison KO)`);
    if (!tickets.length) continue;

    if (rb.clientTitle) {
      // Board global : un groupe de tickets par valeur de « Client (Zendesk) ».
      const groups = new Map<string, Ticket[]>();
      for (const t of tickets) {
        const key = t.fields.client?.trim() ?? '';
        groups.set(key, [...(groups.get(key) ?? []), t]);
      }
      for (const [clientText, group] of groups) {
        if (!clientText) {
          console.log(`  ! ${group.length} ticket(s) sans « Client (Zendesk) » : ${group.map((t) => t.name).join(' ; ')}`);
          continue;
        }
        const matches = matchRunClient(clientText, registry);
        if (matches.length === 1 && matches[0].multica_project_id) {
          const client = matches[0];
          if (!clientReady(client, `[RUN] ${clientText}`, dry, summary)) continue;
          console.log(`  ${clientText} → ${client.slug} : ${group.length} ticket(s)`);
          await importTickets(group, client, 'run', origin, dry, summary);
          continue;
        }
        // Client inconnu ou plusieurs candidats : configuration par Mika.
        summary.newClients++;
        const key = words(clientText).replace(/ /g, '-');
        const pending = findRunClientOnboarding(key);
        if (pending) {
          console.log(`  ${clientText} : client à configurer, déjà demandé (${pending.identifier}, ${pending.status})`);
          continue;
        }
        const candidates = matches.map((c) => c.slug);
        if (dry) {
          console.log(`  ${clientText} : client ${candidates.length ? `douteux (${candidates.join(', ')})` : 'inconnu'}, [dry] issue de configuration à créer (${group.length} ticket(s) en attente)`);
          continue;
        }
        const issue = createOnboardingIssue({
          title: `Nouveau client RUN : ${clientText}`,
          description: describeNewRunClient(clientText, group, candidates, origin),
          boardUrl: `https://axome.monday.com/boards/${rb.id}`,
          runClient: key,
        });
        console.log(`  ${clientText} : client ${candidates.length ? 'douteux' : 'inconnu'}, ${issue.identifier} créée et confiée à l'agent de configuration`);
      }
      continue;
    }

    // Board dédié : le client le déclare dans run_boards.
    const client = registry.find((c) => c.run_boards?.includes(rb.id));
    if (client?.multica_project_id) {
      if (!clientReady(client, `[RUN] ${board.name}`, dry, summary)) continue;
      await importTickets(tickets, client, 'run', origin, dry, summary);
      continue;
    }
    summary.newClients++;
    const pending = findOnboarding(rb.id);
    if (pending) {
      console.log(`  board RUN dédié sans client, configuration déjà demandée (${pending.identifier}, ${pending.status})`);
      continue;
    }
    if (dry) {
      console.log(`  board RUN dédié sans client, [dry] issue de configuration à créer (${tickets.length} ticket(s) en attente)`);
      continue;
    }
    const issue = createOnboardingIssue({
      title: `Nouveau client RUN : ${board.name}`,
      description: describeNewBoard(board, await boardDetails(rb.id), tickets, 'run', origin),
      boardUrl: `https://axome.monday.com/boards/${rb.id}`,
      boardId: rb.id,
    });
    console.log(`  board RUN dédié sans client, ${issue.identifier} créée et confiée à l'agent de configuration`);
  }
}

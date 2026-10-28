// Import des tickets Monday du jour en issues multica « À faire », selon les créneaux de Google Agenda.
// BUILD : créneau avec un code P-AXO → tickets d'Arthur « En cours » ou « Planifié » sur le board du projet.
// RUN : créneau RUN le jour même → tickets d'Arthur « A faire aujourd'hui » sur les boards RUN, rangés par client.
// Un board ou un client RUN inconnu déclenche une issue de configuration confiée à Mika ; les tickets d'un client
// en configuration (champ setup du registre) attendent la fin de celle-ci. Les issues déjà importées sont suivies.
// Usage : build-tickets-import [--dry] [--date YYYY-MM-DD] [--sans-agenda] [--projet P-AXO-…] [--run]
// Un import ne traite jamais que le jour J : pas de préchargement du lendemain (choix d'Arthur, 2026-10-19).
//   --dry          affiche ce qui serait fait, sans rien écrire dans multica
//   --date         jour à traiter (défaut : aujourd'hui, heure de Paris), pour un essai ou un rattrapage manuel
//   --sans-agenda  ignore l'agenda : tous les boards BUILD du registre, plus le RUN du jour
//   --projet       ignore l'agenda : uniquement les boards BUILD de ces codes projet (y compris un nouveau projet)
//   --run          ignore l'agenda : uniquement le RUN du jour
//   --rafraichir   AX-18[,AX-19] ou « tout » : recharge depuis Monday la description d'issues déjà importées, puis s'arrête
//   --nouveautes   AX-18 : affiche les nouveautés Monday pas encore importées pour cette issue, sans rien écrire (pour les agents)
import { parseArgs } from 'node:util';
import { agendaSlots, type RunSlot, type WorkSlot } from './agenda.ts';
import { RUN_BOARDS, RUN_BOARD_ID, loadRegistry, parisDate } from './config.ts';
import { clientReady, importTickets, newSummary } from './importer.ts';
import { describeNewBoard } from './issue-text.ts';
import { boardDetails, listBoards, ticketsForArthur, type Board } from './monday.ts';
import { createOnboardingIssue, findOnboarding } from './multica.ts';
import { refreshIssues } from './refresh.ts';
import { importRun } from './run.ts';
import { printNews, syncImported } from './sync.ts';

const { values: opts } = parseArgs({
  options: {
    dry: { type: 'boolean', default: false },
    date: { type: 'string' },
    'sans-agenda': { type: 'boolean', default: false },
    projet: { type: 'string' },
    run: { type: 'boolean', default: false },
    rafraichir: { type: 'string' },
    nouveautes: { type: 'string' },
  },
});

const isRunBoard = (b: Board) => b.id === RUN_BOARD_ID || RUN_BOARDS.some((r) => r.id === b.id) || /\bRUN\b|\[SUIVI/i.test(b.name);

async function main() {
  const dry = opts.dry;
  if (opts.rafraichir) return refreshIssues(opts.rafraichir, dry);
  if (opts.nouveautes) return printNews(opts.nouveautes);
  const start = opts.date ?? parisDate(new Date());
  const dates = [start];
  const registry = loadRegistry();
  const allBoards = await listBoards();
  const summary = newSummary();

  // Ce qu'il faut importer : boards BUILD, et RUN ou non.
  let buildSlots: WorkSlot[] = [];
  let runSlots: RunSlot[] = [];
  let buildBoards: Board[] = [];
  let doRun = false;
  if (opts.projet) {
    const codes = opts.projet.split(',').map((c) => c.trim()).filter(Boolean);
    buildBoards = allBoards.filter((b) => codes.some((code) => b.name.includes(code)) && !isRunBoard(b));
    for (const code of codes) if (!buildBoards.some((b) => b.name.includes(code))) console.log(`  ! aucun board Monday actif pour ${code}`);
  } else if (opts.run) {
    doRun = true;
  } else if (opts['sans-agenda']) {
    const ids = new Set(registry.flatMap((c) => c.monday_boards ?? []));
    buildBoards = allBoards.filter((b) => ids.has(b.id) && !isRunBoard(b));
    doRun = true;
  } else {
    ({ build: buildSlots, run: runSlots } = await agendaSlots(dates));
    const codes = [...new Set(buildSlots.map((s) => s.code))];
    buildBoards = allBoards.filter((b) => codes.some((code) => b.name.includes(code)) && !isRunBoard(b));
    runSlots = runSlots.filter((s) => s.date === start);
    doRun = runSlots.length > 0;
    console.log(`Agenda du ${start} : ${buildSlots.length} créneau(x) BUILD (${codes.join(', ') || 'aucun projet'}), ` +
      `RUN le ${start} : ${runSlots.map((s) => `« ${s.title} »`).join(', ') || 'aucun créneau'}`);
    for (const code of codes) if (!buildBoards.some((b) => b.name.includes(code))) console.log(`  ! aucun board Monday actif pour ${code}`);
  }

  // BUILD : un board par projet du jour.
  for (const board of buildBoards) {
    const client = registry.find((c) => c.monday_boards?.includes(board.id));
    const slot = buildSlots.find((s) => board.name.includes(s.code));
    const origin = slot ? `le créneau agenda « ${slot.title} » du ${slot.date}` : 'un import sans agenda';
    if (client?.multica_project_id) {
      if (!clientReady(client, board.name, dry, summary)) continue;
      const tickets = await ticketsForArthur(board);
      console.log(`\n${board.name} → ${client.slug} : ${tickets.length} ticket(s) à traiter`);
      await importTickets(tickets, client, 'build', origin, dry, summary);
      continue;
    }
    if (client?.setup && !clientReady(client, board.name, dry, summary)) continue;
    summary.newClients++;
    const pending = findOnboarding(board.id);
    if (pending) {
      console.log(`\n${board.name} : nouveau projet, configuration déjà demandée (${pending.identifier}, ${pending.status})`);
      continue;
    }
    const tickets = await ticketsForArthur(board);
    if (dry) {
      console.log(`\n${board.name} : nouveau projet, [dry] issue de configuration à créer (${tickets.length} ticket(s) en attente)`);
      continue;
    }
    const issue = createOnboardingIssue({
      title: `Nouveau projet : ${board.name}`,
      description: describeNewBoard(board, await boardDetails(board.id), tickets, 'build', origin),
      boardUrl: `https://axome.monday.com/boards/${board.id}`,
      boardId: board.id,
    });
    console.log(`\n${board.name} : nouveau projet, ${issue.identifier} créée et confiée à l'agent de configuration`);
  }

  // RUN : tickets du jour sur les boards RUN.
  if (doRun) {
    const origin = runSlots.length ? `le créneau agenda « ${runSlots[0].title} » du ${runSlots[0].date}` : 'un import RUN sans agenda';
    await importRun({ registry, boards: allBoards, origin, dry, summary });
  }

  const followUp = await syncImported(dry);
  console.log(
    `\n${dry ? '[dry] ' : ''}Bilan : ${summary.created} issue(s) ${dry ? 'à créer' : 'créée(s)'}, ${summary.existing} déjà importée(s), ` +
      `${summary.reopened} rouverte(s), ${summary.newClients} nouveau(x) projet(s) ou client(s), ${summary.waiting} client(s) en configuration ; ` +
      `suivi : ${followUp.closed} terminée(s), ${followUp.reopened} rouverte(s), ${followUp.cancelled} annulée(s), ${followUp.updated} commentée(s), ${followUp.deferred} reportée(s).`,
  );
}

main().catch((err: unknown) => {
  console.error(`build-tickets-import : ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

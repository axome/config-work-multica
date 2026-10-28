// Rapport de consommation des agents multica : tokens et coût estimé, par agent, par client et par issue.
// Usage : multica-usage [--jours 7]
// Coût = équivalent au tarif public de l'API Anthropic (estimation : écritures de cache comptées à 1,25×).
// Avec un abonnement Claude, ce n'est pas une facture, mais l'ordre de grandeur sert à comparer agents et modèles.
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { MULTICA, loadRegistry } from './config.ts';

// $ par million de tokens : entrée, sortie, écriture de cache, lecture de cache (tarifs publics au 2026-10-06).
const PRICES: Record<string, [number, number, number, number]> = {
  'claude-opus-5-5': [4, 20, 5, 0.2],
  'claude-sonnet-5-5': [2, 10, 2.5, 0.2],
  'claude-haiku-5-5': [0.1, 0.5, 0.125, 0.01],
  'claude-haiku-4-5-20251001': [1, 5, 1.25, 0.1],
};

type Usage = { model: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number };
type Task = { id: string; agent_id: string; issue_id: string | null; created_at: string; status: string; usage: Usage[] | null };
type Totals = { runs: number; tokens: number; cost: number; unpriced: Set<string> };

const { values: opts } = parseArgs({ options: { jours: { type: 'string', default: '7' } } });
const since = Date.now() - Number(opts.jours) * 864e5;

const run = (args: string[]) =>
  execFileSync(MULTICA.bin, ['--profile', MULTICA.profile, '--workspace-id', MULTICA.workspaceId, ...args], { encoding: 'utf8' });

const cost = (u: Usage): number | null => {
  const p = PRICES[u.model];
  return p ? (u.input_tokens * p[0] + u.output_tokens * p[1] + u.cache_write_tokens * p[2] + u.cache_read_tokens * p[3]) / 1e6 : null;
};
const tokens = (u: Usage) => u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_write_tokens;
const add = (map: Map<string, Totals>, key: string, task: Task) => {
  const t = map.get(key) ?? { runs: 0, tokens: 0, cost: 0, unpriced: new Set<string>() };
  t.runs++;
  for (const u of task.usage ?? []) {
    t.tokens += tokens(u);
    const c = cost(u);
    if (c === null) t.unpriced.add(u.model);
    else t.cost += c;
  }
  map.set(key, t);
};
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : `${Math.round(n / 1e3)} k`);
const table = (title: string, map: Map<string, Totals>, limit = 50) => {
  const rows = [...map.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, limit);
  console.log(`\n## ${title}\n\n| | Runs | Tokens | Coût estimé |\n|---|---|---|---|`);
  for (const [k, t] of rows) console.log(`| ${k} | ${t.runs} | ${fmt(t.tokens)} | $${t.cost.toFixed(2)}${t.unpriced.size ? ` (+ ${[...t.unpriced].join(', ')} non chiffré)` : ''} |`);
};

type Agent = { id: string; name: string; model?: string };
const agentList = JSON.parse(run(['agent', 'list', '--output', 'json'])) as Agent[] | { agents: Agent[] };
const agents = Array.isArray(agentList) ? agentList : agentList.agents;
const projectToClient = new Map(loadRegistry().filter((c) => c.multica_project_id).map((c) => [c.multica_project_id!, c.slug]));
const issueCache = new Map<string, { identifier: string; title: string; client: string }>();
const issueInfo = (id: string) => {
  if (!issueCache.has(id)) {
    const i = JSON.parse(run(['issue', 'get', id, '--output', 'json'])) as { identifier: string; title: string; project_id: string | null };
    issueCache.set(id, { identifier: i.identifier, title: i.title, client: (i.project_id && projectToClient.get(i.project_id)) || 'hors projet' });
  }
  return issueCache.get(id)!;
};

const byAgent = new Map<string, Totals>();
const byClient = new Map<string, Totals>();
const byIssue = new Map<string, Totals>();
const byModel = new Map<string, Totals>();
let truncated = false;
for (const agent of agents) {
  const tasks = JSON.parse(run(['agent', 'tasks', agent.id, '--output', 'json', '--limit', '200'])) as Task[];
  const recent = tasks.filter((t) => Date.parse(t.created_at) >= since);
  if (tasks.length === 200 && recent.length === 200) truncated = true;
  for (const task of recent) {
    add(byAgent, agent.name, task);
    for (const u of task.usage ?? []) add(byModel, u.model, { ...task, usage: [u] });
    if (task.issue_id) {
      const info = issueInfo(task.issue_id);
      add(byClient, info.client, task);
      add(byIssue, `${info.identifier} ${info.title.slice(0, 60)} (${info.client})`, task);
    } else {
      add(byClient, 'autopilot / sans issue', task);
    }
  }
}

const total = [...byAgent.values()].reduce((s, t) => ({ runs: s.runs + t.runs, cost: s.cost + t.cost }), { runs: 0, cost: 0 });
console.log(`# Consommation multica sur ${opts.jours} jour(s)\n\n${total.runs} run(s), coût estimé $${total.cost.toFixed(2)} (équivalent tarif API).`);
if (truncated) console.log('\n! Un agent dépasse 200 runs sur la période : son total est sous-estimé.');
table('Par agent', byAgent);
table('Par modèle', byModel);
table('Par client', byClient);
table('Issues les plus coûteuses', byIssue, 5);

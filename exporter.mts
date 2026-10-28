// Regénère le kit de configuration depuis la machine d'Arthur : scripts, docs, skills, modèles, agents, autopilots,
// réglages multica et Claude Code. Aucun secret n'est copié : le dossier secrets/ ne contient que des noms de clés.
// Usage : node --no-warnings exporter.mts   (depuis n'importe quel dossier sans .multica/)
// README.md, racine/registry.exemple.yaml, racine/project.exemple.yaml et documentation/ sont écrits à la main et ne sont pas touchés.
// L'automatisation des projets de flux (questionnaire, cadrage, manifeste, étapes, recette automatique) est en test : elle reste
// hors du kit jusqu'à sa validation (agents, skills, scripts, LaunchAgent exclus par leur nom ; tools/flux et internal/docs non copiés ;
// passages des fichiers communs retirés par RETRAITS).
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const KIT = dirname(import.meta.filename);
const WORK = '/Volumes/Work';
const INTERNAL = join(WORK, 'internal');
const MULTICA = ['/Applications/Multica.app/Contents/Resources/app.asar.unpacked/resources/bin/multica',
  '--profile', 'desktop-api.multica.ai', '--workspace-id', '2c231b1f-bcb0-4583-a81c-79135be12a42'];
const GENERES = ['scripts', 'skills', 'modeles-client', 'agents', 'autopilots', 'multica', 'claude-code', 'secrets', 'racine/CLAUDE.md'];
const IGNORES = new Set(['node_modules', '.git', 'dist', '.DS_Store']);
const AUTOMATISATION_FLUX = /^(flux-(?!dev$)|axflux-|shopify-(exec|auth|garde)|com\.axome\.flux-veille)/;

const mc = (...args: string[]): unknown => JSON.parse(execFileSync(MULTICA[0], [...MULTICA.slice(1), ...args, '--output', 'json'], { cwd: '/tmp', encoding: 'utf8' }));
const liste = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : (Object.values(v as object).find(Array.isArray) ?? [])) as Record<string, unknown>[];
const ecrire = (chemin: string, contenu: string) => { mkdirSync(dirname(join(KIT, chemin)), { recursive: true }); writeFileSync(join(KIT, chemin), contenu.endsWith('\n') ? contenu : contenu + '\n'); };
const json = (chemin: string, valeur: unknown) => ecrire(chemin, JSON.stringify(valeur, null, 2));
const copier = (src: string, dest: string) => cpSync(src, join(KIT, dest), { recursive: true, filter: (s) => !IGNORES.has(basename(s)) && !basename(s).startsWith('.env') && !AUTOMATISATION_FLUX.test(basename(s)) });
const nomFichier = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 5).join('-');

for (const g of GENERES) rmSync(join(KIT, g), { recursive: true, force: true });

// Fichiers locaux
copier(join(WORK, 'CLAUDE.md'), 'racine/CLAUDE.md');
copier(join(INTERNAL, 'bin'), 'scripts/bin');
copier(join(INTERNAL, 'tools', 'build-tickets'), 'scripts/tools/build-tickets');
for (const f of readdirSync(join(INTERNAL, 'launchd'))) copier(join(INTERNAL, 'launchd', f), `scripts/launchd/${f}`);
copier(join(INTERNAL, 'multica', 'skills'), 'skills');
copier(join(INTERNAL, 'multica', 'templates', 'client'), 'modeles-client');

// Claude Code : CLAUDE.md global, RTK.md, et un settings réduit aux clés utiles (modèle, plugins, marketplaces, hooks)
const claude = join(homedir(), '.claude');
mkdirSync(join(KIT, 'claude-code'), { recursive: true });
for (const f of ['CLAUDE.md', 'RTK.md']) if (existsSync(join(claude, f))) copyFileSync(join(claude, f), join(KIT, 'claude-code', f));
const settings = JSON.parse(readFileSync(join(claude, 'settings.json'), 'utf8')) as Record<string, unknown>;
// Les hooks qui lancent un outil exclu du kit (shopify-garde) n'y figurent pas non plus
const hooks = settings.hooks as Record<string, { hooks: { command?: string }[] }[]> | undefined;
for (const evenement of Object.keys(hooks ?? {})) {
  hooks![evenement] = hooks![evenement].map((m) => ({ ...m, hooks: m.hooks.filter((h) => !AUTOMATISATION_FLUX.test(basename(h.command ?? ''))) })).filter((m) => m.hooks.length);
}
json('claude-code/settings.exemple.json', Object.fromEntries(['model', 'effortLevel', 'enabledPlugins', 'extraKnownMarketplaces', 'hooks'].filter((k) => k in settings).map((k) => [k, settings[k]])));
json('claude-code/mcp-utilisateur.json', { mcpServers: {
  make: { type: 'stdio', command: `${INTERNAL}/bin/make-mcp` },
  n8n: { type: 'stdio', command: `${INTERNAL}/bin/n8n-mcp` },
} });

// Workspace multica
const ws = mc('workspace', 'get') as Record<string, string>;
ecrire('multica/workspace/contexte.md', ws.context);
json('multica/workspace/workspace.json', { name: ws.name, description: ws.description, issue_prefix: ws.issue_prefix });
json('multica/workspace/labels.json', liste(mc('label', 'list')).map((l) => ({ name: l.name, color: l.color, description: l.description, resource_type: l.resource_type, ancien_id: l.id })));
json('multica/workspace/proprietes.json', liste(mc('property', 'list')).filter((p) => !p.archived).map((p) => ({ name: p.name, type: p.type, icon: p.icon, description: p.description, config: p.config, ancien_id: p.id })));

// Bibliothèque MCP : le CLI n'expose pas les définitions, elles sont identiques à celles de ~/.claude.json
const MCP: Record<string, object> = {
  make: { type: 'stdio', command: `${INTERNAL}/bin/make-mcp` },
  n8n: { type: 'stdio', command: `${INTERNAL}/bin/n8n-mcp` },
  'shopify-dev-mcp': { type: 'stdio', command: 'npx', args: ['-y', '@shopify/dev-mcp@latest'] },
  'chrome-devtools': { type: 'stdio', command: 'npx', args: ['chrome-devtools-mcp@latest'] },
};
for (const s of liste(mc('workspace', 'mcp', 'list'))) {
  const nom = String(s.name);
  if (!MCP[nom]) throw new Error(`Serveur MCP inconnu de l'exporteur : ${nom}, ajouter sa définition dans exporter.ts`);
  json(`multica/mcp/${nom}.json`, MCP[nom]);
}

// Verrou anti-push : chaque push git échoue, fetch et pull passent
const VERROU = 'url.push-interdit-aux-agents-multica://.pushInsteadOf';
json('multica/verrou-anti-push.json', { GIT_CONFIG_COUNT: '3', GIT_CONFIG_KEY_0: VERROU, GIT_CONFIG_VALUE_0: 'git@', GIT_CONFIG_KEY_1: VERROU, GIT_CONFIG_VALUE_1: 'https://', GIT_CONFIG_KEY_2: VERROU, GIT_CONFIG_VALUE_2: 'ssh://' });

// Agents : configuration sans custom_env (seul le verrou y figure, reproduit ci-dessus), instructions dans <nom>.md
const agents = liste(mc('agent', 'list')).filter((a) => !a.archived_at && !AUTOMATISATION_FLUX.test(String(a.name)));
const skillsParAgent: Record<string, string[]> = {};
json('agents/agents.json', agents.map((a) => {
  const skills = liste(a.skills).map((s) => String(s.name ?? s)).filter((s) => !AUTOMATISATION_FLUX.test(s));
  for (const s of skills) (skillsParAgent[s] ??= []).push(String(a.name));
  ecrire(`agents/${a.name}.md`, String(a.instructions ?? ''));
  return {
    name: a.name, description: a.description, model: a.model, thinking_level: a.thinking_level,
    max_concurrent_tasks: a.max_concurrent_tasks, permission_mode: a.permission_mode, visibility: a.visibility,
    systeme: a.system_key ? `agent système multica (${a.system_key}) : il existe déjà, ne reprendre que ses instructions, skills et MCP` : undefined,
    skills, mcp: liste(mc('agent', 'mcp', 'list', String(a.id))).map((m) => m.name), custom_env: 'multica/verrou-anti-push.json',
    instructions: `agents/${a.name}.md`,
  };
}));

// Skills publiés : description et agents (le contenu est dans skills/<nom>.md, identique à la version publiée)
json('multica/skills.json', liste(mc('skill', 'list')).filter((s) => !AUTOMATISATION_FLUX.test(String(s.name))).map((s) => ({ name: s.name, description: s.description, fichier: `skills/${s.name}.md`, agents: skillsParAgent[String(s.name)] ?? [] })));

// Autopilots : réglages et déclencheurs dans autopilots.json, prompt dans <titre>.md
const agentParId = Object.fromEntries(agents.map((a) => [a.id, a.name]));
json('autopilots/autopilots.json', liste(mc('autopilot', 'list')).map((p) => {
  const fichier = `autopilots/${nomFichier(String(p.title))}.md`;
  ecrire(fichier, String(p.description ?? ''));
  return {
    title: p.title, mode: p.execution_mode, issue_title_template: p.issue_title_template || undefined, status: p.status,
    agent: agentParId[String(p.assignee_id)] ?? p.assignee_id, prompt: fichier,
    triggers: liste(mc('autopilot', 'trigger-list', String(p.id))).map((t) => ({ kind: t.kind, cron: t.cron_expression, timezone: t.timezone, label: t.label })),
  };
}));

// Secrets : arborescence et noms de clés seulement, valeurs vides
const SECRETS: Record<string, string> = {
  'github/default.env': 'GITHUB_TOKEN_AXOME=\nGITHUB_TOKEN_ZERANCE131=\n',
  'google/calendar.env': 'GOOGLE_CALENDAR_ICS_URL=\n',
  'make/default.env': 'MAKE_ZONE=eu2.make.com\nMAKE_MCP_TOKEN=\n',
  'make/eu1.env': 'MAKE_ZONE=eu1.make.com\nMAKE_MCP_TOKEN=\n',
  'monday/default.env': 'MONDAY_API_TOKEN=\n',
  'n8n/<slug>.env': 'N8N_API_URL=\nN8N_API_KEY=\n# N8N_MCP_ALLOW_WRITE=true\n',
};
for (const [f, c] of Object.entries(SECRETS)) { mkdirSync(dirname(join(KIT, 'secrets', f)), { recursive: true }); writeFileSync(join(KIT, 'secrets', `${f}.exemple`), c); }

// Passages des fichiers communs qui décrivent l'automatisation des flux. Si l'un d'eux a changé à la source, l'export s'arrête :
// adapter ce tableau plutôt que de laisser l'automatisation entrer dans le kit.
const RETRAITS: Record<string, [string | RegExp, string][]> = {
  'racine/CLAUDE.md': [
    [/^- \*\*`internal\/bin\/shopify-exec`\*\*.*\n/m, ''],
    [/^- \*\*Projets de flux axflux × Shopify\*\*.*\n/m, ''],
    [/ Exception, les projets de flux .*?Le push reste toujours à Arthur\./, ''],
  ],
  'multica/workspace/contexte.md': [[/, sauf dans un projet de flux .*? limité à son périmètre ;/, ' ;']],
  'agents/flux-dev.md': [
    ["Commit : seulement par flux-commit, en fin d'étape d'un projet de flux (skill axflux-build) ; ailleurs tu modifies", 'Tu modifies'],
    [/^- Pour une issue d'étape d'un projet de flux .*\n/m, ''],
  ],
  'agents/reviewer.md': [
    [' Dans un projet de flux, tes corrections de revue se commitent par flux-commit (skill axflux-build) ; ailleurs, aucun commit.', ' Aucun commit.'],
    [/^- Pour une issue d'étape d'un projet de flux .*\n/m, ''],
  ],
  'modeles-client/project.yaml': [[/ ; recette: autorisee ouvre les écritures de recette\n.*\n/, '\n']],
};
for (const [fichier, retraits] of Object.entries(RETRAITS)) {
  let texte = readFileSync(join(KIT, fichier), 'utf8');
  for (const [motif, remplacement] of retraits) {
    if (!(typeof motif === 'string' ? texte.includes(motif) : motif.test(texte))) throw new Error(`${fichier} : passage introuvable (${motif}), mettre à jour RETRAITS dans exporter.mts`);
    texte = texte.replace(motif, remplacement);
  }
  writeFileSync(join(KIT, fichier), texte);
}

console.log(`Kit regénéré dans ${KIT} : ${agents.length} agents, ${Object.keys(skillsParAgent).length} skills affectés.`);

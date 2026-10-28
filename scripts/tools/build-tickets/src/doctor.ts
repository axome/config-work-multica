// Contrôle de cohérence de /Volumes/Work : registre, project.yaml, projets multica, boards Monday, repos et secrets.
// Lecture seule : ce script ne corrige rien, il liste les écarts. Usage : work-doctor
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { MULTICA, RUN_BOARDS, RUN_BOARD_ID, WORK_DIR, loadRegistry } from './config.ts';
import { listBoards } from './monday.ts';
import { issueStatus } from './multica.ts';

const SECRETS = join(homedir(), 'Library/CloudStorage/Dropbox/Ubuntu/home/.secrets');
const SETUP_MAX_DAYS = 7;

type Repo = { path?: string | null; remote?: string | null };
type Project = {
  client?: string;
  multica?: { project_id?: string };
  monday?: { boards?: { id: number }[] };
  repos?: Repo[];
  flux?: { make?: { org_id?: number } | []; n8n?: { url?: string } | [] };
};
type Resource = { resource_type: string; resource_ref: { url?: string; local_path?: string } };

const multica = (args: string[]) =>
  execFileSync(MULTICA.bin, ['--profile', MULTICA.profile, '--workspace-id', MULTICA.workspaceId, ...args], { encoding: 'utf8' });
const git = (dir: string, args: string[]) => {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};
const sameRemote = (a: string, b: string) => a.replace(/\.git$/, '').toLowerCase() === b.replace(/\.git$/, '').toLowerCase();

async function main() {
  const registry = loadRegistry();
  const projects = new Set((JSON.parse(multica(['project', 'list', '--output', 'json'])) as { id: string }[]).map((p) => p.id));
  const boards = new Map((await listBoards()).map((b) => [b.id, b.name]));
  let problems = 0;

  for (const client of registry) {
    const issues: string[] = [];
    const info: string[] = [];
    const dir = join(WORK_DIR, client.path);
    const yamlPath = join(dir, 'project.yaml');
    if (!existsSync(dir)) issues.push(`dossier ${client.path} introuvable`);
    let project: Project = {};
    if (!existsSync(yamlPath)) issues.push('project.yaml introuvable');
    else {
      try {
        project = loadYaml(readFileSync(yamlPath, 'utf8')) as Project;
      } catch (err) {
        issues.push(`project.yaml illisible : ${(err as Error).message.split('\n')[0]}`);
      }
    }
    if (project.client && project.client !== client.slug) issues.push(`client « ${project.client} » dans project.yaml ≠ slug « ${client.slug} »`);
    if (!existsSync(join(dir, 'CLAUDE.md'))) issues.push('CLAUDE.md introuvable');
    if (!existsSync(join(dir, '_agent'))) issues.push('_agent/ introuvable');

    // Projet multica et ressources.
    const pid = client.multica_project_id;
    if (!pid) issues.push('pas de multica_project_id dans le registre');
    else if (!projects.has(pid)) issues.push(`projet multica ${pid.slice(0, 8)} introuvable`);
    if (pid && project.multica?.project_id && project.multica.project_id !== pid) issues.push('project_id différent entre registre et project.yaml');
    let resources: Resource[] = [];
    if (pid && projects.has(pid)) resources = JSON.parse(multica(['project', 'resource', 'list', pid, '--output', 'json'])) as Resource[];
    if (pid && projects.has(pid) && !resources.some((r) => r.resource_type === 'local_directory' && r.resource_ref.local_path === join(dir, '_agent'))) {
      issues.push('ressource multica _agent absente ou mal placée');
    }

    // Repos : copie locale (si path) et ressource multica.
    for (const repo of project.repos ?? []) {
      if (!repo.remote) continue;
      if (repo.path) {
        const local = join(dir, repo.path);
        if (!existsSync(local)) issues.push(`repo ${repo.path} : copie locale absente (mettre path: null si voulu)`);
        else {
          const remotes = git(local, ['remote', '-v']).split('\n').map((l) => l.split(/\s+/)[1]).filter(Boolean);
          if (!remotes.some((r) => sameRemote(r, repo.remote!))) issues.push(`repo ${repo.path} : remote ${repo.remote} absent de la copie locale`);
        }
      }
      if (resources.length && !resources.some((r) => r.resource_type === 'github_repo' && r.resource_ref.url && sameRemote(r.resource_ref.url, repo.remote!))) {
        issues.push(`repo ${repo.remote} : pas de ressource dans le projet multica`);
      }
    }

    // Boards Monday : existence et cohérence registre / project.yaml.
    // Les boards RUN (global et dédiés) ne sont pas des boards de projet : ils ne passent pas par monday_boards.
    const isRun = (id: number) => id === RUN_BOARD_ID || RUN_BOARDS.some((r) => r.id === id);
    const yamlBoards = new Set((project.monday?.boards ?? []).map((b) => Number(b.id)).filter((id) => !isRun(id)));
    for (const id of client.monday_boards ?? []) {
      if (!boards.has(id) && id !== RUN_BOARD_ID) issues.push(`board Monday ${id} introuvable ou inactif`);
      if (yamlBoards.size && !isRun(id) && !yamlBoards.has(id)) issues.push(`board ${id} dans le registre mais pas dans project.yaml`);
    }
    for (const id of yamlBoards) if (!(client.monday_boards ?? []).includes(id)) issues.push(`board ${id} dans project.yaml mais pas dans le registre (non importé)`);
    for (const id of client.run_boards ?? []) if (!boards.has(id)) issues.push(`board RUN dédié ${id} introuvable ou inactif`);

    // Secrets attendus (présence du fichier seulement, jamais son contenu).
    const n8n = project.flux?.n8n;
    if (n8n && !Array.isArray(n8n) && n8n.url && !existsSync(join(SECRETS, 'n8n', `${client.slug}.env`))) issues.push(`clé n8n absente : .secrets/n8n/${client.slug}.env`);

    // Configuration en cours.
    if (client.setup) {
      const status = issueStatus(client.setup);
      if (status === 'done') info.push(`setup ${client.setup} terminé : sera retiré au prochain import`);
      else if (!status) issues.push(`setup ${client.setup} : issue introuvable, les tickets ne seront jamais importés`);
      else {
        const created = statSync(yamlPath, { throwIfNoEntry: false })?.birthtimeMs ?? Date.now();
        const days = Math.floor((Date.now() - created) / 864e5);
        (days > SETUP_MAX_DAYS ? issues : info).push(`en configuration (${client.setup}, ${status}) depuis ${days} jour(s)`);
      }
    }

    // TODO restants (information).
    const todos = ['project.yaml', 'CLAUDE.md']
      .map((f) => join(dir, f))
      .filter(existsSync)
      .reduce((n, f) => n + (readFileSync(f, 'utf8').match(/\bTODO\b/g) ?? []).length, 0);
    if (todos) info.push(`${todos} TODO`);

    problems += issues.length;
    const mark = issues.length ? '✗' : '✓';
    console.log(`${mark} ${client.slug}${info.length ? ` (${info.join(', ')})` : ''}`);
    for (const i of issues) console.log(`    - ${i}`);
  }

  // Dossiers clients absents du registre.
  const known = new Set(registry.map((c) => c.path));
  const orphans = readdirSync(join(WORK_DIR, 'clients'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !known.has(`clients/${d.name}`))
    .map((d) => d.name);
  if (orphans.length) {
    problems += orphans.length;
    console.log(`✗ dossiers clients absents du registre : ${orphans.join(', ')}`);
  }
  console.log(`\n${registry.length} client(s) contrôlé(s), ${problems} écart(s).`);
}

main().catch((err: unknown) => {
  console.error(`work-doctor : ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

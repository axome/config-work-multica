// Recherche des repos d'un client dans les organisations GitHub d'Axome, en lecture seule.
// Usage : github-repos <mot-clé> [mot-clé…]   ex. github-repos "marcy" "marcy-paris"
import { readSecret } from './config.ts';

const ORGS = [
  { org: 'axome', key: 'GITHUB_TOKEN_AXOME' },
  { org: 'Zerance131', key: 'GITHUB_TOKEN_ZERANCE131' },
];

type Repo = {
  full_name: string;
  ssh_url: string;
  private: boolean;
  archived: boolean;
  language: string | null;
  pushed_at: string;
  default_branch: string;
  description: string | null;
};

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function listRepos(org: string, token: string): Promise<Repo[]> {
  const repos: Repo[] = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`https://api.github.com/orgs/${org}/repos?type=all&per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!res.ok) throw new Error(`GitHub ${org} : HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const batch = (await res.json()) as Repo[];
    repos.push(...batch);
    if (batch.length < 100) return repos;
  }
}

async function main() {
  const keywords = process.argv.slice(2).map(normalize).filter(Boolean);
  if (!keywords.length) throw new Error('usage : github-repos <mot-clé> [mot-clé…]');
  let found = 0;
  for (const { org, key } of ORGS) {
    // Jeton propre à l'organisation (fine-grained) sinon jeton classique commun GITHUB_TOKEN.
    let token: string | undefined;
    for (const k of [key, 'GITHUB_TOKEN']) {
      try {
        token = readSecret('github/default.env', k);
        break;
      } catch {}
    }
    if (!token) {
      console.log(`! ${org} : ni ${key} ni GITHUB_TOKEN dans .secrets/github/default.env, organisation non consultée`);
      continue;
    }
    const matches = (await listRepos(org, token)).filter((r) =>
      keywords.some((k) => normalize(r.full_name).includes(k) || normalize(r.description ?? '').includes(k)),
    );
    for (const r of matches.sort((a, b) => b.pushed_at.localeCompare(a.pushed_at))) {
      found++;
      console.log(
        [r.full_name, r.ssh_url, r.private ? 'privé' : 'public', r.archived ? 'archivé' : 'actif', r.language ?? '-',
          `dernier push ${r.pushed_at.slice(0, 10)}`, `branche ${r.default_branch}`, r.description ?? ''].join(' | '),
      );
    }
  }
  console.log(`${found} repo(s) trouvé(s) pour : ${process.argv.slice(2).join(', ')}`);
}

main().catch((err: unknown) => {
  console.error(`github-repos : ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

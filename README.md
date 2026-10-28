<!--
Kit de configuration de l'organisation de travail d'Arthur : dossier Work + workspace multica + Claude Code.
Écrit à la main. Tout le reste du dossier est regénéré par exporter.mts, sauf racine/registry.exemple.yaml et racine/project.exemple.yaml.
-->

# Kit de configuration Work + multica

Ce dossier permet de reproduire l'organisation de travail d'Arthur chez un autre utilisateur, sur un autre Mac ou dans un autre compte multica :
- un volume `Work` avec un dossier par client ;
- le contexte en deux fichiers par client ;
- les outils internes ;
- les secrets hors du volume ;
- le workspace multica : agents, skills, projets et autopilots ;
- la configuration de Claude Code.

Il est destiné à Claude (Claude Code ou un agent multica), qui l'applique section par section. Tout ce qui est copiable s'y trouve : il suffit de l'adapter.

État : 27 octobre 2026, multica 0.7.0, Claude Code 2.1.310, Node 24.9.0.

## 0. Contenu du kit

| Dossier du kit | Contenu | Destination |
|---|---|---|
| `racine/` | `CLAUDE.md` (règles communes), `registry.exemple.yaml`, `project.exemple.yaml` (schéma commenté) | `/Volumes/Work/` |
| `modeles-client/` | `CLAUDE.md` et `project.yaml` d'un nouveau client, avec les `{{…}}` | `/Volumes/Work/internal/multica/templates/client/` |
| `scripts/bin/` | 8 commandes (wrappers bash et relais MCP) | `/Volumes/Work/internal/bin/` |
| `scripts/tools/` | Sources TypeScript de `build-tickets` (sans `node_modules`) | `/Volumes/Work/internal/tools/` |
| `skills/` | Les 3 skills multica (sources identiques aux versions publiées) | `/Volumes/Work/internal/multica/skills/`, puis publication |
| `agents/` | `agents.json` (réglages) et `<agent>.md` (instructions), 7 agents | multica (section 8.6) |
| `autopilots/` | `autopilots.json` (réglages et déclencheurs) et un `.md` par prompt | multica (section 8.7) |
| `multica/` | `workspace/` (contexte, réglages, labels, propriétés), `mcp/` (4 serveurs), `skills.json`, `verrou-anti-push.json` | multica (sections 8.2 à 8.6) |
| `claude-code/` | `CLAUDE.md` et `RTK.md` globaux, `settings.exemple.json`, `mcp-utilisateur.json` | `~/.claude/` (section 7) |
| `secrets/` | Arborescence des secrets en `.exemple` : noms de clés, valeurs vides | `<SECRETS>/` (section 6) |
| `documentation/` | `organisation-du-travail.md` : documentation explicative (architecture, contexte, exemple complet du client Sidas, avantages et limites), source du Google Doc du même nom | — (à lire) |
| `exporter.mts` | Regénère le kit depuis la machine d'Arthur | — |

Dans les commandes qui suivent, `KIT` désigne le chemin de ce dossier :

```bash
KIT=/chemin/vers/config-work-multica
```

## 1. Mode d'emploi pour Claude

### 1.1 Règles pendant l'installation
1. N'affiche, ne copie et n'écris jamais la valeur d'un secret, ni dans un fichier versionné, ni dans un commentaire, ni dans un log. Les fichiers de secrets sont créés vides : l'humain les remplit.
2. Ne lance jamais une connexion OAuth ou navigateur (`shopify store auth`, connexion multica, connecteurs Google) : c'est un geste humain.
3. N'ouvre pas `~/.multica/profiles/*/config.json` : il contient le jeton.
4. Lance le CLI multica depuis un dossier sans `.multica/` (par exemple `/tmp`). Depuis zsh, passe par un tableau bash :
   ```bash
   bash -c 'M=(<MULTICA> --profile <PROFILE> --workspace-id <WS>); "${M[@]}" agent list --output json'
   ```
   Plus bas, `M` désigne cette commande.
5. Aucun `git push`, aucune PR, aucun déploiement.
6. Procède dans l'ordre des sections, vérifie chaque étape (section 10) et note les écarts.

### 1.2 Valeurs du nouvel utilisateur
Demande chaque valeur à l'humain, n'en invente aucune.

| Variable | Valeur chez Arthur | Rôle |
|---|---|---|
| `<WORK>` | `/Volumes/Work` | Racine du travail. **Garder ce chemin** évite d'adapter les scripts et les skills, qui le citent partout. |
| `<SECRETS>` | `~/Library/CloudStorage/Dropbox/Ubuntu/home/.secrets` | Dossier des secrets, hors de `<WORK>`, dans un stockage privé |
| `<MULTICA>` | `/Applications/Multica.app/Contents/Resources/app.asar.unpacked/resources/bin/multica` | CLI fourni par Multica Desktop |
| `<PROFILE>` | `desktop-api.multica.ai` | Profil multica (serveur `https://api.multica.ai`) |
| `<WS>` | `2c231b1f-bcb0-4583-a81c-79135be12a42` | Id du workspace |
| `<DAEMON>` | `01a1345d-2867-70de-89f2-8f7aa8001613` | Id du daemon local (`~/.multica/daemon.id`) |
| `<RUNTIME>` | `a501f3ee-81e1-4c74-9a9d-f7ca06fd53a2` | Runtime Claude local (`M runtime list`) |
| `<OWNER>` / `<OWNER_USER_ID>` | `Arthur André` / `8da4b447-45d4-4b4a-a177-7b6d6fbb2146` | Membre propriétaire : lead des projets, mentions `mention://member/<id>` |
| `<MONDAY_WS>` | `7022194` | Workspace Monday des projets |
| `<RUN_BOARDS>` | `436291671` (global), `6028054939`, `9020395385` | Boards Monday de support (RUN) |
| `<GH_ORGS>` | `axome`, `Zerance131` | Organisations GitHub des repos clients |
| `<HOME>` / `<NODE>` | `/Users/arthur` / `~/.nvm/versions/node/v24.9.0/bin` | Dossier personnel et Node 24 |

### 1.3 Points d'adaptation
Ces fichiers contiennent des valeurs propres à Arthur. Après la copie (sections 3 à 5), remplace chaque valeur par celle du nouvel utilisateur.

| Valeur d'origine | Fichiers à adapter (chemins du kit) |
|---|---|
| `Library/CloudStorage/Dropbox/Ubuntu/home/.secrets` | `scripts/bin/make-mcp`, `scripts/bin/n8n-mcp`, `scripts/tools/build-tickets/src/config.ts`, `scripts/tools/build-tickets/src/doctor.ts`, `skills/axome-client-onboarding.md`, `racine/CLAUDE.md` |
| `desktop-api.multica.ai` et `2c231b1f-…` (profil et workspace) | `scripts/tools/build-tickets/src/config.ts` (`MULTICA`), `exporter.mts` |
| `01a1345d-…` (daemon) | `skills/axome-client-onboarding.md` |
| `8da4b447-…` et « Arthur André » (propriétaire) | `skills/axome-client-onboarding.md` |
| Ids des labels `4d5a0871-…` (Monday modifié) et `645ebe54-…` (RUN) | `scripts/tools/build-tickets/src/multica.ts`, `skills/axome-build-cycle.md`, à remplacer par les ids créés en section 8.3 |
| `7022194` (workspace Monday) | `scripts/tools/build-tickets/src/monday.ts`, `modeles-client/project.yaml` |
| Boards RUN `436291671`, `6028054939`, `9020395385` | `scripts/tools/build-tickets/src/config.ts` (`RUN_BOARD_ID`, liste des boards RUN et leurs colonnes), `racine/CLAUDE.md` |
| `'Mika'` (agent d'onboarding) | `scripts/tools/build-tickets/src/config.ts` (`ONBOARDING_AGENT`) : nom de l'agent système, identique dans tout workspace multica |
| `axome`, `Zerance131` (organisations GitHub) | `scripts/tools/build-tickets/src/github-repos.ts`, `scripts/bin/github-repos`, `skills/axome-client-onboarding.md`, `racine/CLAUDE.md` |
| « Arthur » dans les règles | `racine/CLAUDE.md`, `multica/workspace/contexte.md`, `agents/*.md`, `skills/*.md`, `modeles-client/project.yaml` : « Arthur relit, commite, pousse » désigne le propriétaire |

Pour retrouver une valeur : `grep -rn '<valeur>' "$KIT" --exclude-dir=node_modules`.

## 2. Prérequis de la machine

| Élément | Version ou réglage | Pourquoi |
|---|---|---|
| macOS sur Apple Silicon | — | Volume APFS dédié |
| Node via nvm | 24.9.0 | Les outils sont en TypeScript, exécuté directement par Node (`node --no-warnings x.ts`), sans build |
| Claude Code | ≥ 2.1 | Runtime des agents multica et poste de travail |
| Multica Desktop | 0.7.0 | Fournit le CLI et gère le daemon (démarré depuis l'app) |
| OrbStack ou Docker | — | Postgres local des repos axflux |
| Stockage privé synchronisé (Dropbox) | compte personnel | Héberge `<SECRETS>`, jamais `<WORK>` |
| git et clés SSH | accès à `<GH_ORGS>` | Clone des repos clients ; `axflux-framework` et `axome-claude-plugins` sont aussi des repos à cloner |
| RTK (`rtk`) | optionnel | Proxy qui réduit la sortie des commandes (hook Claude Code) |

## 3. Volume, arborescence et fichiers racine

`<WORK>` est un **volume APFS séparé, sensible à la casse**, avec une réserve et un quota de 50 Go, chiffré au repos par FileVault. Il n'est ni dans Dropbox ni un lien symbolique.

```bash
diskutil list                         # repérer le conteneur APFS du disque interne (ex. disk3)
diskutil apfs addVolume disk3 "Case-sensitive APFS" Work -reserve 50g -quota 50g
mkdir -p /Volumes/Work/{clients,internal,personal,sandbox,_archive}
cp "$KIT/racine/CLAUDE.md" /Volumes/Work/CLAUDE.md                # puis section 1.3
printf '# Index des clients migrés dans /Volumes/Work.\n# Détail de chaque client : clients/<slug>/project.yaml\nclients:\n' > /Volumes/Work/registry.yaml
```

Arborescence cible :

```
/Volumes/Work/
├── CLAUDE.md            # règles communes, chargées par tout agent lancé sous /Volumes/Work
├── registry.yaml        # index des clients (modèle : racine/registry.exemple.yaml)
├── clients/<slug>/      # un client = un dossier (section 4)
│   ├── CLAUDE.md        # contexte métier et pièges ; importe project.yaml
│   ├── project.yaml     # contexte machine (schéma : racine/project.exemple.yaml)
│   ├── <type>-<nom>/    # repos git nommés comme le repo distant (app-, checkout-, theme-, axflux-, n8n-, make-)
│   ├── migration-<nom>/, scripts/, data/, docs/   # non versionnés ; data/ ne l'est jamais
│   └── _agent/          # dossier d'exécution des agents multica
├── internal/            # outillage (section 5)
├── personal/, sandbox/, _archive/
```

`racine/CLAUDE.md` est la copie du fichier d'Arthur. Il contient :
1. la structure ;
2. la marche à suivre avant toute tâche sur un client (lire CLAUDE.md et project.yaml, ne jamais deviner un domaine, un host ou un id, respecter `guardrails`) ;
3. un paragraphe par outil ;
4. les règles communes :
   - les agents ne commitent ni ne poussent ;
   - le push est réservé au propriétaire ;
   - une info manquante devient une demande bloquante ;
   - aucun secret dans un fichier, un commentaire ou un log ;
   - dry-run avant toute écriture Shopify, ERP ou SFTP ;
   - les données client ne sortent pas de leur dossier.

## 4. Le dossier d'un client

- **`CLAUDE.md`** (pour les humains et les agents) : activité, périmètre (tableau dossier → rôle), façons de travailler et pièges. Sa dernière ligne, `@project.yaml`, importe le contexte machine. Claude Code charge les `CLAUDE.md` en remontant l'arborescence : un agent lancé dans `clients/<slug>/_agent` reçoit d'abord `/Volumes/Work/CLAUDE.md`, puis celui du client.
- **`project.yaml`** (pour les machines) : la seule source des domaines, repos, ids Make et n8n, boards Monday, projet multica, emplacements des secrets et garde-fous. Il est lu par `work-doctor`, `make-mcp`, `n8n-mcp` et les skills. Le schéma complet et commenté est dans `racine/project.exemple.yaml`.

Ajouter un client (c'est ce que fait l'agent Mika avec le skill `axome-client-onboarding`) :
1. Choisir le slug, en minuscules avec des tirets.
2. Créer `clients/<slug>/` et `_agent/`, puis copier `modeles-client/` en remplaçant `{{NAME}} {{SLUG}} {{ISSUE}} {{DATE}} {{BOARD_ID}} {{CODE}} {{BOARD_NAME}} {{PROJECT_ID}}`.
3. Trouver les repos avec `internal/bin/github-repos <mots-clés>` et les cloner sous `clients/<slug>/<nom du repo distant>`.
4. Créer le projet multica (section 8.8).
5. Ajouter l'entrée dans `registry.yaml`.
6. Lancer `internal/bin/work-doctor`.

## 5. L'outillage : `internal/`

```bash
mkdir -p /Volumes/Work/internal/multica/templates
cp -R "$KIT/scripts/bin" "$KIT/scripts/tools" /Volumes/Work/internal/
cp -R "$KIT/skills" /Volumes/Work/internal/multica/skills
cp -R "$KIT/modeles-client" /Volumes/Work/internal/multica/templates/client
chmod +x /Volumes/Work/internal/bin/*
# adapter les valeurs de la section 1.3, puis :
cd /Volumes/Work/internal/tools/build-tickets && npm install && npm run typecheck
# repos à cloner à part :
git clone git@github.com:axome/axflux-framework.git /Volumes/Work/internal/axflux-framework                 # framework des flux axflux
git clone git@github.com:Zerance131/axome-claude-plugins.git /Volumes/Work/internal/axome-claude-plugins     # marketplace de plugins Claude Code
```

Le projet `tools/build-tickets` est en ESM, avec un `tsconfig` en `NodeNext`, `strict`, `noEmit`, `allowImportingTsExtensions` et `erasableSyntaxOnly`.

| Commande | Rôle |
|---|---|
| `build-tickets-import` | Importe les tickets Monday du jour en issues multica « À faire » :<br>- BUILD : créneaux Google Agenda portant un code `P-AXO-…` ;<br>- RUN : tickets « A faire aujourd'hui » des boards RUN.<br>Options `--dry`, `--date`, `--sans-agenda`, `--projet`, `--run`, `--rafraichir`, `--nouveautes <issue>` |
| `work-doctor` | Cohérence registre, project.yaml, multica, Monday, repos et secrets (lecture seule) |
| `multica-usage [--jours N]` | Tokens et coût estimé par agent, modèle, client et issue |
| `temps-run [--date]` | Temps RUN chronométré dans Monday |
| `github-repos <mots>` | Recherche de repos dans `<GH_ORGS>` |
| `make-mcp` (+ `make-mcp-relay.mjs`) | MCP Make : relais stdio vers `https://<zone>/mcp`, sans OAuth |
| `n8n-mcp` | MCP n8n résolu par client (`npx -y n8n-mcp@2.93.0`), lecture seule par défaut |

## 6. Les secrets

```bash
mkdir -p <SECRETS> && chmod 700 <SECRETS>
cp -R "$KIT/secrets/." <SECRETS>/
cd <SECRETS> && for f in $(find . -name '*.exemple'); do mv "$f" "${f%.exemple}"; done && find . -type f -exec chmod 600 {} +
mv <SECRETS>/n8n/'<slug>.env' <SECRETS>/n8n/<slug du client>.env   # un fichier par client sur n8n
```

L'humain remplit ensuite les valeurs. Toi, tu n'ouvres pas ces fichiers.

| Fichier | Clés |
|---|---|
| `make/default.env`, `make/<zone>.env`, `make/<slug>.env` | `MAKE_ZONE`, `MAKE_MCP_TOKEN` : jeton Make global **en lecture seule**. Ordre de résolution : `<slug>`, puis `<zone>`, puis `default` |
| `n8n/<slug>.env` | `N8N_API_URL`, `N8N_API_KEY`, option `N8N_MCP_ALLOW_WRITE=true` |
| `monday/default.env` | `MONDAY_API_TOKEN` |
| `github/default.env` | `GITHUB_TOKEN_AXOME`, `GITHUB_TOKEN_ZERANCE131` (ou `GITHUB_TOKEN`) |
| `google/calendar.env` | `GOOGLE_CALENDAR_ICS_URL` (adresse secrète iCal de l'agenda) |

Les wrappers MCP lisent le client dans le `project.yaml` le plus proche du dossier courant. Variables pour forcer les valeurs : `AXOME_CLIENT`, `MAKE_SECRETS_DIR`, `N8N_SECRETS_DIR`.

## 7. Claude Code

```bash
cp "$KIT/claude-code/CLAUDE.md" "$KIT/claude-code/RTK.md" ~/.claude/      # préférences globales (à relire et adapter)
claude mcp add --scope user make -- /Volumes/Work/internal/bin/make-mcp
claude mcp add --scope user n8n -- /Volumes/Work/internal/bin/n8n-mcp
```

- `claude-code/mcp-utilisateur.json` donne la même définition des deux serveurs, sans aucune variable : les secrets sont chargés par les wrappers.
- `claude-code/settings.exemple.json` : modèle, effort, plugins (dont `axome-shopify` et `axome-git` de la marketplace `axome`), marketplaces et hooks (`rtk hook claude` avant chaque commande Bash, sons de fin et de notification). À fusionner dans `~/.claude/settings.json`, sans écraser ses autres clés.
- Dans les repos d'app Shopify : un `.mcp.json` avec `shopify-dev-mcp` (`npx -y @shopify/dev-mcp@latest`).

## 8. Le workspace multica

### 8.1 Installation et connexion
1. Installer Multica Desktop et s'y connecter : c'est un geste humain. L'app crée `~/.multica/profiles/<PROFILE>/` et gère le daemon.
2. Relever le workspace (`M workspace list`), le daemon (`~/.multica/daemon.id`) et le runtime (`M runtime list`, provider `claude`, mode local). Reporter ces valeurs dans la section 1.2.

### 8.2 Workspace
`multica/workspace/workspace.json` donne le nom, la description et le préfixe ; `contexte.md` donne le texte de contexte commun à tous les agents.

```bash
M workspace update --name "Axome" --description "Agence Shopify — apps, extensions, thèmes, flux, migrations" --issue-prefix AX \
  --context-stdin < "$KIT/multica/workspace/contexte.md"
```

Seuls les statuts intégrés sont utilisés : `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`.

### 8.3 Labels et propriété
Une commande par entrée de `multica/workspace/labels.json` et de `proprietes.json` :

```bash
M label create --name "RUN" --color "#ef4444" --description "<description du fichier>"
M property create --name Monday --type url --icon link --description "Lien vers l'item Monday d'origine"
```

Noter les nouveaux ids : le champ `ancien_id` donne l'id d'Arthur, à remplacer partout (section 1.3).

### 8.4 Bibliothèque MCP
Un fichier par serveur dans `multica/mcp/` :

```bash
for f in "$KIT"/multica/mcp/*.json; do M workspace mcp add "$(basename "$f" .json)" --server-config-file "$f"; done
M workspace mcp list --output json      # noter les ids
```

### 8.5 Skills
Les sources sont dans `/Volumes/Work/internal/multica/skills/`, et ce sont elles qui font foi. `multica/skills.json` donne la description à publier et les agents de chaque skill.

```bash
M skill create --name <nom> --description "<description de skills.json>" --content-file /Volumes/Work/internal/multica/skills/<nom>.md --output json
M skill update <skill-id> --content-file /Volumes/Work/internal/multica/skills/<nom>.md --output json    # après chaque modification
```

| Skill | Rôle |
|---|---|
| `axome-client-context` | Socle appliqué avant toute tâche :<br>- lecture du contexte (registry, CLAUDE.md, project.yaml, repo) ;<br>- modification de la copie de travail après `git pull --ff-only`, sans forcer ;<br>- git en lecture seule, garde-fous, compte rendu. |
| `axome-build-cycle` | Cycle d'un ticket Monday : analyse, code ou plan, compte rendu, `in_review`. Mots-clés : « ok commit », « réponse monday », « capitalise », « terminé ». |
| `axome-client-onboarding` | Création ou rattachement d'un client quand un nouveau board Monday apparaît |

### 8.6 Agents
`agents/agents.json` donne pour chaque agent :
- description, modèle, `thinking_level`, `max_concurrent_tasks` et `permission_mode` ;
- skills et serveurs MCP (par nom) ;
- fichier d'instructions : `agents/<nom>.md`.

Chaque agent reçoit le **verrou anti-push** (`multica/verrou-anti-push.json`) dans son `custom_env`. Les variables `GIT_CONFIG_*` redirigent tout push vers une adresse invalide : le push échoue, fetch et pull passent.

Pour chaque entrée de `agents.json` :

```bash
M agent create --name <name> --description "<description>" --model <model> --thinking-level <thinking_level> \
  --max-concurrent-tasks <max_concurrent_tasks> --runtime-id <RUNTIME> --permission-mode public_to --public-to-workspace \
  --instructions "$(cat "$KIT/agents/<name>.md")" --custom-env-file "$KIT/multica/verrou-anti-push.json" --output json
M agent skills set <agent-id> --skill-ids <ids des skills listés>
M agent mcp add <agent-id> <id de chaque serveur MCP listé>
```

- **Mika** est l'agent système (`systeme` dans `agents.json`) : il existe déjà. Mettre à jour ses instructions (`M agent update`), ses skills et ses MCP, sans le recréer.
- `agent copy` ne recopie pas `custom_env` : il faut toujours repasser le verrou.
- Les avatars (emojis) se posent dans l'interface.

| Agent | Modèle | Rôle |
|---|---|---|
| Mika | Sonnet | Agent système : découpe, répartit, configure les nouveaux clients |
| shopify-dev | Opus | Apps, extensions, Functions, Prisma |
| theme-dev | Sonnet | Thèmes Liquid |
| migration | Sonnet | Migrations de données |
| reviewer | Opus | Relecture |
| importeur | Haiku | Exécute les autopilots |
| flux-dev | Opus | Flux : axflux, n8n, Make, échanges SFTP/ERP |

### 8.7 Autopilots
`autopilots/autopilots.json` donne pour chacun :
- titre, mode, modèle de titre d'issue, agent ;
- fichier du prompt ;
- déclencheurs (cron, fuseau, libellé).

```bash
M autopilot create --title "<title>" --agent importeur --mode <mode> --description "$(cat "$KIT/<prompt>")" \
  [--issue-title-template "<issue_title_template>"] --subscriber "<OWNER>" --output json
M autopilot trigger-add <autopilot-id> --kind schedule --cron "<cron>" --timezone Europe/Paris --label "<label>"
```

Ils planifient l'import des tickets (7 h 30, 11 h 30, 15 h 30 en semaine), le rapport hebdomadaire (lundi 8 h) et le récap du temps RUN (18 h en semaine).

### 8.8 Projets
Un projet par client :
- titre : nom d'affichage ; icône : emoji métier ;
- statut `in_progress`, lead `<OWNER>` ;
- description : « Client X — résumé. / Dossier : /Volumes/Work/clients/<slug> — lire CLAUDE.md + project.yaml avant toute tâche. / Monday : P-AXO-… (board id) ».

```bash
M project create --title "<Nom>" --icon "🧴" --status in_progress --lead "<OWNER>" --description "<description>" --output json
M project resource add <pid> --type local_directory --local-path /Volumes/Work/clients/<slug>/_agent \
  --daemon-id <DAEMON> --execution-mode in_place --label "_agent (contexte client)"
M project resource add <pid> --type github_repo --url <remote ssh> --default-branch-hint <branche> --label <repo>
```

Reporter l'id dans `registry.yaml` (`multica_project_id`) et dans `project.yaml` (`multica.project_id`).

### 8.9 Conventions des issues
- Propriété `Monday` : URL de l'item d'origine. Label `RUN` : ticket de support. Label `Monday modifié` : ticket changé depuis l'import.
- **Métadonnées de l'import** : `monday_item_id` (dédoublonnage), `monday_board_id`, `monday_kind`, `monday_status`, `monday_assigned`, `monday_last_update_at`, `monday_asset_refs`, `closed_by_import`, `cancelled_by_import`.
- **Métadonnées de l'onboarding** : `onboarding_board_id`, `onboarding_run_client`.

## 9. La chaîne de travail : BUILD et RUN depuis Monday
1. L'autopilot d'import lance `build-tickets-import`. Les tickets du jour deviennent des issues `todo` dans le projet du client, avec la propriété Monday, les métadonnées et les pièces jointes, et le label RUN s'il y a lieu.
2. Un board inconnu crée une issue « Nouveau projet : <board> » pour Mika, qui applique `axome-client-onboarding`.
3. L'agent assigné suit `axome-build-cycle` : analyse, code ou plan dans la copie de travail, compte rendu, puis `in_review`.
4. Le propriétaire répond dans l'issue. C'est lui qui commite et pousse.

## 10. Vérification finale

| Contrôle | Commande | Attendu |
|---|---|---|
| Cohérence | `/Volumes/Work/internal/bin/work-doctor` | aucun écart bloquant |
| Outils | `npm run typecheck` dans `tools/build-tickets` | 0 erreur |
| Valeurs adaptées | `grep -rn '2c231b1f\|01a1345d\|8da4b447\|4d5a0871\|645ebe54' /Volumes/Work/internal` | aucun résultat (sauf si c'est le compte d'Arthur) |
| Agents | `M agent list --output json` | 7 agents conformes à `agents/agents.json` |
| Verrou anti-push | issue de test : `git push --dry-run` dans un repo | push refusé, fetch et pull OK |
| Skills | contenu publié (`M skill get <id>`) comparé à `internal/multica/skills/` | identiques |
| Autopilots | `M autopilot list` puis `trigger-list` | 3 actifs, déclencheurs conformes |
| Projets | `M project list` | un projet par slug, ids reportés |
| MCP | `claude mcp list` | `make` et `n8n` connectés |
| Import | `build-tickets-import --dry` | bilan sans erreur |

## 11. Maintenir le kit

Le kit est un dossier autonome, prévu pour être un repo git. Chez Arthur, il se trouve dans `/Volumes/Work/internal/config-work-multica`.
- **C'est une copie, pas la configuration active.** Les agents, les skills publiés et les outils utilisent les fichiers de `/Volumes/Work` et de `~/.claude`. Rien ne pointe vers le kit : on peut le déplacer ou le renommer sans rien casser.
- **L'exporteur ne dépend pas de l'emplacement du kit** : il écrit dans son propre dossier. Il lit la configuration active aux chemins définis en tête de `exporter.mts` (`WORK`, `INTERNAL`, `MULTICA`). Si ces chemins changent un jour, il suffit de les modifier là.
- **`.gitignore`** exclut `node_modules` et refuse dans `secrets/` tout fichier qui n'est pas un `.exemple`.

Après une modification d'un agent, d'un skill, d'un autopilot, d'un script ou d'une doc, regénérer le kit depuis la machine d'Arthur, puis commiter :

```bash
cd /tmp && node --no-warnings <chemin du kit>/exporter.mts
```

- L'exporteur remplace tout le contenu généré.
- Il ne touche pas à `README.md`, aux deux exemples de `racine/` ni à `documentation/`, qui sont écrits à la main.
- `documentation/organisation-du-travail.md` est la source du Google Doc « Organisation du travail : Work, multica, kit et exemple client » (dossier Drive AxomeDoc). Pour mettre le Doc à jour, modifier le fichier, puis recréer le Doc à partir de lui. Les modifications faites directement dans le Doc ne reviennent pas dans le fichier.
- Il ne copie aucun `.env`, aucun `node_modules` et aucun secret.
- Un serveur MCP inconnu de l'exporteur l'arrête : ajouter sa définition dans `exporter.mts`.
- **L'automatisation des projets de flux est exclue** tant qu'elle est en test (questionnaire, cadrage, manifeste, étapes, recette automatique). Les agents, skills, scripts et LaunchAgent qui en relèvent sont écartés par leur nom (`AUTOMATISATION_FLUX`), et `tools/flux` et `internal/docs` ne sont pas copiés. Les phrases qui la décrivent dans les fichiers communs sont retirées par `RETRAITS`. Si l'une d'elles a changé à la source, l'export s'arrête : mettre à jour `RETRAITS`.

## 12. Limites connues

- **Pas de sauvegarde versionnée** pour `internal/`, `registry.yaml`, le `CLAUDE.md` racine et les fichiers de contexte des clients. Ce kit en est une copie à un instant donné, pas une sauvegarde.
- **Les instructions des agents et les prompts des autopilots** n'ont pas d'autre source que multica. Le kit en garde une copie à chaque export.
- **Un seul runtime, sur une seule machine** : si le Mac est éteint ou si Multica Desktop est fermé, aucun agent ne tourne.
- **Le CLI multica 0.7.0 n'expose pas la définition des serveurs MCP du workspace** : celles du kit sont identiques à `~/.claude.json`.
- **Les données des clients ne sont pas dans le kit** (registre réel, dossiers, `project.yaml`). Un nouvel utilisateur part des exemples de `racine/` et ajoute ses clients (section 4). Seule exception : la section 4 de `documentation/organisation-du-travail.md` reproduit les fichiers réels du client Sidas (IP du middleware masquée). Ils ne contiennent aucun secret, mais des domaines, des ids Make et des remotes : à anonymiser avant de partager le kit hors d'Axome.

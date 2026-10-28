<!--
Source versionnée du Google Doc « Organisation du travail : Work, multica, kit et exemple client »
Écrite à la main : exporter.mts n'y touche pas. Pour mettre à jour le Google Doc, modifier ce fichier puis demander à Claude
de recréer le Doc à partir de lui. Les fichiers de la section 4 sont ceux de clients/sidas au 2026-10-27, IP du middleware masquée.
-->

# Organisation du travail : Work, multica, kit et exemple client

*État au 27 octobre 2026. Document personnel d'Arthur. La section 4 montre les vrais fichiers d'un client complet. Le kit pour reproduire la configuration chez un autre utilisateur est dans `/Volumes/Work/internal/config-work-multica` (section 14). L'automatisation des projets de flux, encore en test, n'est pas décrite ici.*

## 1. En bref

Tout le travail tient dans un volume dédié, **/Volumes/Work**, organisé autour d'une règle simple : **un client = un dossier = un projet multica**. Chaque dossier client porte son propre contexte, lisible par un humain comme par un agent IA :
- un **CLAUDE.md** qui explique le client (activité, périmètre, pièges) ;
- un **project.yaml** qui donne les faits exacts (boutiques, repos, flux, Monday, emplacements des secrets, garde-fous).

Autour de ce socle :
- **Monday** reste la source des projets et des tickets ; un import automatique en fait des issues multica trois fois par jour.
- **Multica** fait travailler des agents Claude spécialisés sur ces issues, avec des procédures communes (les skills) et des garde-fous techniques : aucun agent ne peut pousser du code.
- **Les secrets** ne sont jamais dans le dossier de travail : ils sont dans un Dropbox privé, et les fichiers de contexte disent seulement où les trouver.
- **Des outils internes** en TypeScript font le lien : import Monday, contrôle de cohérence, serveurs MCP Make et n8n par client.
- **Un kit de configuration** réunit dans un seul dossier, prêt à devenir un repo, tout ce qu'il faut pour reproduire l'ensemble.

Arthur garde la main sur ce qui compte : il relit, commite, pousse, déploie, et tranche les décisions métier que les agents lui remontent.

## 2. L'architecture en un coup d'œil

| Élément | Rôle |
|---|---|
| **/Volumes/Work** | Volume APFS séparé (50 Go, sensible à la casse, chiffré). Racine de tout le travail. |
| **CLAUDE.md** (racine) | Règles communes chargées par tout agent lancé sous /Volumes/Work : structure, outils, commit et push, secrets, écritures en prod. |
| **registry.yaml** | Index des 24 clients : dossier, boutiques, boards Monday, organisation Make, instance n8n, projet multica. |
| **clients/&lt;slug&gt;/** | Un dossier par client : CLAUDE.md, project.yaml, repos git nommés &lt;type&gt;-&lt;nom&gt; (app-, checkout-, theme-, axflux-, n8n-, make-), scripts/, data/, docs/, et _agent/ (dossier d'exécution des agents). |
| **internal/** | Outillage Axome : commandes (bin/), projets TypeScript (tools/), sources des skills et des modèles multica, frameworks axflux et axmigration, plugins Claude Code, kit de configuration (config-work-multica/). |
| **personal/, sandbox/, _archive/** | Projets perso, essais, dossiers morts. |
| **Dropbox privé : .secrets/** | Jetons Make, clés n8n par client, Monday, GitHub, Google : hors du volume de travail. |
| **Multica** | Workspace « Axome » : 24 projets (un par client), et pour le BUILD et le RUN 7 agents, 3 skills et 3 autopilots. Le daemon tourne sur le Mac et lance Claude Code pour chaque tâche. |

## 3. Le contexte, cœur du dispositif

Un agent IA ne vaut que par le contexte qu'il reçoit. Toute l'organisation est pensée pour qu'un agent, comme un humain qui découvre un client, trouve au même endroit et dans le même ordre ce qu'il doit savoir.

### 3.1 Trois niveaux de CLAUDE.md

Claude Code charge automatiquement les fichiers CLAUDE.md en remontant l'arborescence depuis le dossier où il travaille. Un agent lancé dans clients/sidas/_agent reçoit donc, sans rien faire :
1. **/Volumes/Work/CLAUDE.md** : les règles valables partout ;
2. **clients/sidas/CLAUDE.md** : ce qu'est le client, ses marques, ses flux, ses pièges ;
3. puis, quand il entre dans un repo, le **CLAUDE.md du repo** : conventions de code, commandes, architecture.

Chaque niveau ne dit que ce qui lui est propre. Une règle commune n'est écrite qu'une fois, à la racine.

### 3.2 project.yaml : le contexte machine

Le CLAUDE.md d'un client se termine par la ligne **@project.yaml**, qui l'importe. Ce fichier YAML porte les faits qu'il ne faut jamais deviner : boards Monday, projet multica, boutiques (avec leur rôle et leur phase), repos (chemin, remote, vérifications, déploiement), flux (Make, n8n, axflux, systèmes tiers), emplacements des secrets et garde-fous. Il sert aussi aux outils :
- les serveurs MCP **make** et **n8n** y trouvent le client dont ils doivent charger la clé ;
- **work-doctor** contrôle chaque semaine la cohérence de l'ensemble.

### 3.3 registry.yaml : l'index

Le registre relie chaque slug à son dossier, ses boutiques, ses boards Monday (projet et RUN), son organisation Make, son instance n8n et son projet multica. C'est par lui que l'import Monday sait dans quel projet ranger un ticket, et qu'un agent retrouve le dossier du client de son issue.

### 3.4 Pourquoi deux fichiers plutôt qu'un

| | CLAUDE.md | project.yaml |
|---|---|---|
| **Lecteur** | Humains et agents | Agents et outils |
| **Contenu** | Explications, façons de faire, pièges | Faits exacts : domaines, ids, chemins, commandes |
| **Format** | Markdown libre | YAML structuré, même schéma pour tous les clients |
| **Erreur évitée** | Un agent qui ne comprend pas le métier | Un agent qui invente un domaine, un id de scénario ou un host SFTP |

## 4. Exemple complet : le client Sidas / Therm-ic

Sidas est l'un des clients les plus complets :
- deux marques (Sidas et Therm-ic), huit boutiques Shopify ;
- 4 repos : une app, un projet axflux, deux checkouts ;
- des flux Make, un middleware MySQL et un SFTP.

Les fichiers ci-dessous sont les vrais, recopiés tels quels. Seule l'adresse IP du middleware est masquée.

### 4.1 Le dossier

```
/Volumes/Work/clients/sidas/
├── CLAUDE.md            contexte métier, importe project.yaml
├── project.yaml         contexte machine
├── _agent/              dossier d'exécution des agents multica (vide entre deux runs)
├── app-sidas-storeloc/  repo Zerance131 : app store locator (a son propre README)
├── axflux-sidas/        repo axome : flux axflux (a son propre CLAUDE.md, voir 4.5)
├── checkout-sidas/      repo Zerance131 : function discount-gift de Sidas
└── checkout-thermic/    repo Zerance131 : même function pour Therm-ic
```

Côté multica, le projet « Sidas / Therm-ic » (icône 🧦) a cinq ressources : les 4 repos GitHub, et le dossier local _agent sur lequel s'exécutent les agents.

### 4.2 L'entrée du registre (registry.yaml)

```yaml
  - slug: sidas
    path: clients/sidas
    stores: []  # TODO: domaines myshopify (Sidas FR/CH/US, Therm-ic EU/CH/US/CA/B2B), voir brands
    monday_boards: [18426859690, 18431689877, 436291671]
    make: { zone: eu2.make.com, org_id: 1493500, team_id: 446046 }
    multica_project_id: d4aa0919-00fe-4d50-95cc-0e7319b474c2
```

Le **# TODO** est volontaire. Une information inconnue reste vide et signalée, plutôt que devinée. work-doctor rappelle ces trous chaque semaine, et un agent qui en aurait besoin poserait la question au lieu d'inventer un domaine.

### 4.3 clients/sidas/CLAUDE.md

```markdown
# Client Sidas / Therm-ic

Groupe d'équipement outdoor et sport, avec deux marques : **Sidas** (semelles, chaussettes) et **Therm-ic** (produits chauffants).
Il y a une boutique Shopify par marque et par marché : Sidas FR, CH et US, puis Therm-ic EU, CH, US, CA et un B2B en cours.
L'essentiel du travail Axome porte sur le **store locator** : les données magasins viennent du middleware et de Make, axflux les transforme en métaobjets Shopify, puis l'app store locator les expose au front.

## Périmètre Axome

| Dossier | Rôle |
|---|---|
| `app-sidas-storeloc/` | App store locator : métaobjets `store_locator` → Postgres → API GeoJSON (App Proxy), une config par marque |
| `axflux-sidas/` | Sync miroir CSV Matrixify (SFTP) → métaobjets Shopify, un flux par boutique |
| `checkout-sidas/` | Function de remise `discount-gift` pour Sidas |
| `checkout-thermic/` | Même function pour Therm-ic, avec un code identique : reporter chaque correction dans les deux repos |

## Flux Make (org « Sidas Thermic »)

- **Common** : `Flux 1 Files => Images => Matrixify`, `Flux 1.5 Trigger export`.
- **Par boutique** : `Flux 2 Image Result => Import => Database`, `Flux 3 Database => Treat => Metaobjects`, `Flux 4 Metaobject Result => Import => Database`, plus `Contact To Zendesk`.
- Les flux `[Progus]` et `[Stores]` sont d'anciennes versions désactivées.

Le serveur MCP `make` est en lecture seule et voit toutes les organisations : filtrer sur l'org et l'équipe Sidas.
Toujours identifier **la marque et le marché** avant d'agir : boutique, flux axflux, dossier SFTP et dossier Make (voir `brands` dans `project.yaml`).

## Configuration détaillée

@project.yaml
```

Ce qu'il faut retenir de ce fichier :
- il est court et parle métier : à quoi sert chaque dossier, comment s'enchaînent les flux, quels pièges éviter (« reporter chaque correction dans les deux repos », « identifier la marque et le marché ») ;
- aucun identifiant n'y est recopié : ils sont tous dans project.yaml, importé par la dernière ligne.

### 4.4 clients/sidas/project.yaml

```yaml
# Contexte machine du client Sidas / Therm-ic — à lire avant toute tâche.
# Ne jamais mettre de valeur secrète ici : seulement l'emplacement des secrets.
client: sidas
name: Sidas / Therm-ic
updated: 2026-10-16

monday:
  workspace_id: 7022194
  boards:
    - { id: 18426859690, code: P-AXO-2608-011, name: "Thermic pro / SHOPIFY B2B" }
    - { id: 18431689877, code: P-AXO-2609-022, name: "THERMIC - Duplication BE" }
    - { id: 436291671, name: "[RUN] Axome Maintenance", note: "board RUN partagé : filtrer sur Sidas / Thermic" }

multica:
  project_id: d4aa0919-00fe-4d50-95cc-0e7319b474c2

brands: # une boutique Shopify par marque et par marché
  - name: Sidas
    stores:
      - { market: FR, domain: null, axflux: sidas-fr-metaobjects-sync, sftp_home: /home/sidas, make_folder: 124342 } # TODO domaine
      - { market: CH, domain: null, axflux: sidas-ch-metaobjects-sync, sftp_home: /home/sidasch, make_folder: 209448 } # TODO domaine
      - { market: US, domain: null, axflux: sidas-us-metaobjects-sync, sftp_home: /home/sidasus, make_folder: 197505 } # TODO domaine
    checkout_app: checkout-sidas
  - name: Therm-ic
    stores:
      - { market: EU, domain: null, axflux: thermic-eu-metaobjects-sync, sftp_home: /home/thermic, make_folder: 124339 } # TODO domaine
      - { market: CH, domain: null, axflux: thermic-ch-metaobjects-sync, sftp_home: /home/thermicch, make_folder: 124340 } # TODO domaine
      - { market: US, domain: null, axflux: thermic-us-metaobjects-sync, sftp_home: /home/thermicus, make_folder: 124341 } # TODO domaine
      - { market: CA, domain: null, axflux: thermic-ca-metaobjects-sync, sftp_home: /home/thermicca, make_folder: 519542 } # TODO domaine
      - { market: B2B, domain: null, make_folder: 537255, note: "projet en cours (Thermic pro)" } # TODO domaine
    checkout_app: checkout-thermic

dev_stores:
  - { domain: dev-vincent-changea.myshopify.com, app: app-sidas-storeloc }
  - { domain: checkout-matheop.myshopify.com, app: checkout-thermic }

repos:
  - path: app-sidas-storeloc
    remote: git@github.com:Zerance131/app-sidas-storeloc.git
    kind: shopify-app
    purpose: "Store locator Sidas et Therm-ic : webhooks metaobjects (type store_locator) → PostgreSQL, API GeoJSON publique via App Proxy /apps/storeloc/api/getStores"
    stack: React Router v7 + Prisma (PostgreSQL)
    api_version: "2026-01"
    configs:
      sidas: { file: shopify.app.toml, hosting: https://app-sidas-storeloc-8ea9084fc25e.herokuapp.com }
      thermic: { file: shopify.app.thermic.toml, hosting: https://app-thermic-storeloc-fb22aa73f42b.herokuapp.com, note: "fichier non versionné" }
    docs: README.md
    checks: npm run typecheck && npm run lint
    deploy: "app : Heroku (remote git `heroku` = app Sidas, `git push heroku main`) ; config Shopify : shopify app deploy --config <sidas|thermic>"

  - path: checkout-sidas
    remote: git@github.com:Zerance131/checkout-sidas.git
    kind: shopify-app
    purpose: "Function de remise produit discount-gift (purchase.product-discount.run) pour les boutiques Sidas"
    stack: Remix (app vide, seule l'extension compte)
    api_version: "2026-04"
    checks: npm run lint
    deploy: shopify app deploy

  - path: checkout-thermic
    remote: git@github.com:Zerance131/checkout-thermic.git
    kind: shopify-app
    purpose: "Même function discount-gift pour les boutiques Therm-ic (code source identique à checkout-sidas)"
    stack: Remix (app vide, seule l'extension compte)
    api_version: "2026-04"
    checks: npm run lint
    deploy: shopify app deploy
    note: "Reporter toute correction de discount-gift dans les deux repos"

  - path: axflux-sidas
    remote: git@github.com:axome/axflux-sidas.git
    kind: axflux
    purpose: "Sync miroir des métaobjets magasins : CSV Matrixify sur le SFTP (<sftp_home>/stores/axflux/metaobjects/input) → métaobjets Shopify, un flux par boutique"
    docs: CLAUDE.md du repo + docs/
    local: docker compose up (app + postgres, dashboard http://localhost:3100)
    checks: npm test
    deploy: push main → GitHub Actions (runner self-hosted) → image Harbor → SSH prod

flux:
  axflux:
    repo: axflux-sidas
    flows: axflux-sidas/flows/*/flow.yaml # 7 sync metaobjects (une par boutique) + test-alerte-erreur (manuel, ne jamais planifier)
    connectors: "sftp-sidas, shopify-<marque>-<marché> (configurés dans la base axflux, pas dans le repo)"
    sync: "clé métier store_code ; suppression des orphelins plafonnée à 30 % (MAX_ORPHAN_DELETE_RATIO) ; fichier vide = aucune suppression"
  make:
    zone: eu2.make.com
    org_id: 1493500
    team_id: 446046
    mcp: "serveur MCP `make` (jeton global lecture seule) : toujours filtrer sur org_id / team_id ci-dessus"
    folders: # 57 scénarios ; un dossier par boutique (voir brands), plus :
      - { id: 456897, name: Common }
    pattern: "[Common] Flux 1 Files => Images => Matrixify et Flux 1.5 Trigger export ; par boutique : Flux 2 Image Result => DB, Flux 3 DB => Metaobjects, Flux 4 Metaobject Result => DB ; Contact To Zendesk par boutique"
    inactive: "anciens flux [Progus] et [Stores] Flux 1-4 (désactivés)"
  systems:
    middleware: "MySQL axome sur <adresse masquée>:3307 (connexion Make « Middleware MySQL »)"
    sftp: "NAS Sidas nas.sidas.com (connexion Make « Middleware FTP ») ; SFTP intégré à axflux (sftp_partners)"
    support: "Zendesk Sidas, Sidas World USA (legacy)"
  n8n: []

secrets: # emplacements uniquement
  - "MCP Make : jeton global lecture seule, ~/Library/CloudStorage/Dropbox/Ubuntu/home/.secrets/make/default.env"
  - "axflux-sidas/.env (local) ; prod : secrets et variables GitHub du repo ; identifiants des connecteurs chiffrés dans la base axflux"
  - "app-sidas-storeloc/.env (local) ; prod : config vars Heroku"
  - "Connexions Zendesk, Google Sheets, MySQL et SSH middleware : stockées dans Make uniquement"

guardrails:
  - "Aucun push sans autorisation explicite d'Arthur : push main d'axflux-sidas = déploiement prod ; `git push heroku` = déploiement de l'app store locator."
  - "Les flux axflux sont en miroir et suppriment des métaobjets en prod : toujours lancer en --dry d'abord, ne jamais exécuter un flux sans accord explicite."
  - "Aucune écriture Admin API en prod sans dry-run puis validation explicite ; identifier la marque et le marché avant d'agir."
  - "Make : n'agir que dans l'org 1493500 / team 446046. Ne jamais modifier, activer ou désactiver un scénario actif sans demande explicite : produire le blueprint ou la procédure."
  - "discount-gift : toute modification se fait dans checkout-sidas et checkout-thermic."
```

Lecture bloc par bloc :

| Bloc | Ce qu'il apporte | Qui s'en sert |
|---|---|---|
| en-tête | Le rappel « jamais de valeur secrète », identique dans tous les clients | Les humains et les agents |
| monday | Boards projet (avec leur code P-AXO), et le board RUN partagé à filtrer sur ce client | L'import des tickets, les agents |
| multica | L'id du projet, qui relie le dossier au workspace | L'import, work-doctor |
| brands | Bloc propre aux clients multi-marques : pour chaque marque et chaque marché, la boutique, le flux axflux, le dossier SFTP et le dossier Make. Un agent sait ainsi exactement quoi toucher pour « Therm-ic CH ». | Les agents (dev, flux) |
| dev_stores | Les boutiques de développement où tester sans risque | Les agents |
| repos | Pour chaque repo : où il est, d'où il vient, à quoi il sert, sa stack et sa version d'API, la commande de vérification à lancer avant de rendre (checks), et ce qu'un push déclencherait (deploy) | Les agents, work-doctor |
| flux | Le projet axflux (flux, connecteurs, règle de synchronisation), l'organisation et l'équipe Make (filtre obligatoire du MCP), les conventions de nommage des scénarios, les systèmes tiers | Les agents, le MCP make |
| secrets | Où sont les secrets (Dropbox privé, .env locaux, Heroku, GitHub, base axflux, Make), jamais leur valeur | Les humains et les agents |
| guardrails | Les interdits propres au client : ce qu'un push déploie, les flux qui suppriment en prod, le périmètre Make, la règle des deux repos de checkout | Tous les agents, avant d'agir |

### 4.5 Le troisième niveau : le CLAUDE.md d'un repo (extrait d'axflux-sidas)

Dans le repo, le contexte devient technique : framework, conventions, commandes. Extrait :

```markdown
# Axflux Framework

Framework Node.js CLI-first pour le developpement et l'execution de flux de donnees.
Les devs vibe-codent leurs flux avec Claude Code en s'appuyant sur ce document.

**Lire la documentation complete dans `docs/` avant de developper un flux.**
[…]
## Avant de coder un flux — IMPORTANT

Ne JAMAIS executer de flux automatiquement apres creation ou modification. Toujours demander la permission explicite de l'utilisateur avant de lancer `axflux run` ou de cliquer sur "Run" dans le dashboard.

Quand un developpeur demande de creer un nouveau flux, ne PAS coder immediatement.
D'abord poser les questions necessaires pour avoir toutes les informations.
[…]
Ne jamais inventer de chemins de fichiers, de mappings, de noms de champs ou de connecteurs.
Si une information manque, la demander au developpeur.
```

Les trois niveaux disent la même chose à des échelles différentes : la racine interdit de deviner, le client précise quoi vérifier (marque, marché, org Make), et le repo précise comment (questions à poser avant de coder un flux).

### 4.6 Ce que fait un agent avec ces fichiers

Exemple : un ticket Monday demande de corriger la remise discount-gift de Therm-ic.
1. L'import crée l'issue dans le projet « Sidas / Therm-ic », avec le lien vers le ticket. Mika l'assigne à shopify-dev.
2. Le skill axome-client-context lui fait lire, dans l'ordre : le registre (→ clients/sidas), le CLAUDE.md racine, le CLAUDE.md du client, puis project.yaml.
3. Dans project.yaml, il trouve deux repos de checkout et la règle « toute modification se fait dans checkout-sidas et checkout-thermic ». Il corrige donc les deux.
4. Il fait un **git pull --ff-only** sur chaque repo, modifie la copie de travail, puis lance **npm run lint** (le champ checks).
5. Il ne déploie pas : le champ deploy lui apprend que **shopify app deploy** toucherait les boutiques en prod, et le garde-fou l'interdit sans demande. Il rend compte et passe l'issue « En relecture ».
6. Arthur relit le diff des deux repos, commite et déploie.

À aucun moment l'agent n'a eu à deviner un nom de repo, une commande ou une règle.

## 5. Les secrets

Aucun secret n'est stocké dans /Volumes/Work. Ils sont rangés par service dans un dossier .secrets du **Dropbox privé**, et non du Dropbox d'équipe :
- make/default.env : jeton Make global en lecture seule ; un fichier par zone ou par client peut le remplacer ;
- n8n/&lt;client&gt;.env : une clé par instance n8n, en lecture seule sauf mention explicite ;
- monday, github, google : jetons des outils d'import, adresse de l'agenda.

Un agent qui a besoin d'une clé demande à Arthur de la déposer à un emplacement donné, sans jamais en demander la valeur. Les scripts lisent les fichiers clé par clé, sans jamais les afficher.

## 6. Les outils internes

Les outils sont dans internal/bin, en TypeScript exécuté directement par Node 24, sans étape de build.

| Famille | Outils |
|---|---|
| **Monday ↔ multica** | **build-tickets-import** : import des tickets du jour (BUILD selon l'agenda Google, RUN selon les boards de support), suivi des changements, pièces jointes. **temps-run** : récap du temps RUN. **github-repos** : recherche de repos. |
| **Pilotage** | **work-doctor** : contrôle de cohérence de tout le dispositif. **multica-usage** : consommation et coût des agents. |
| **Accès encadrés** | **make-mcp** et **n8n-mcp** : serveurs MCP qui chargent la clé du bon client, en lecture seule. |

## 7. Multica

### 7.1 Le principe

Multica est le tableau de bord des agents. Le workspace « Axome » contient un projet par client. Une issue y est une tâche : statut, agent assigné, commentaires, pièces jointes. Le daemon de Multica Desktop tourne sur le Mac : quand une issue est assignée à un agent, il lance Claude Code dans le dossier _agent du client, avec les instructions et les skills de cet agent.

Le workspace porte un texte de contexte commun, qui rappelle l'organisation et les règles non négociables :
- pas de push ni de déploiement ;
- pas de secret dans un fichier, un commentaire ou un log ;
- pas d'écriture en prod sans demande explicite ;
- une info manquante devient une question.

### 7.2 Les agents

Chaque agent a un métier, un modèle adapté à sa difficulté, ses skills et ses serveurs MCP. Opus est réservé au raisonnement difficile, Sonnet au travail cadré, Haiku à l'exécution de scripts.

| Agent | Modèle | Rôle |
|---|---|---|
| Mika | Sonnet | Agent système : découpe et répartit les tâches, configure les nouveaux clients |
| shopify-dev | Opus | Apps Shopify, extensions, Functions, Prisma |
| theme-dev | Sonnet | Thèmes Liquid |
| migration | Sonnet | Migrations de données vers Shopify |
| reviewer | Opus | Relecture de code |
| importeur | Haiku | Exécute les autopilots |
| flux-dev | Opus | Flux axflux, n8n, Make, échanges SFTP/ERP |

**Verrou anti-push** : chaque agent reçoit des variables d'environnement git qui redirigent tout push vers une adresse invalide. Lire, récupérer et mettre à jour fonctionnent ; pousser échoue toujours.

### 7.3 Les skills

- **axome-client-context** : le socle, appliqué avant toute tâche (ordre de lecture du contexte, copie de travail mise à jour sans forcer, git en lecture seule, garde-fous, compte rendu). C'est lui qui produit le parcours décrit en 4.6.
- **axome-build-cycle** : le cycle d'un ticket Monday, puis les retours d'Arthur (« ok commit », « réponse monday », « capitalise », « terminé »).
- **axome-client-onboarding** : création ou rattachement d'un client quand un nouveau board Monday apparaît. Il produit un dossier comme celui de la section 4, à partir des modèles.

### 7.4 Les autopilots

- **Import des tickets du jour** : 7 h 30, 11 h 30 et 15 h 30 en semaine.
- **Rapport hebdomadaire** : le lundi à 8 h, avec la consommation des agents et le contrôle de cohérence.
- **Récap du temps RUN** : 18 h en semaine.

### 7.5 La vie d'une issue

1. Un ticket Monday devient une issue « À faire » dans le projet du client, avec le lien, les échanges et les pièces jointes ; un ticket de support porte le label RUN.
2. L'agent passe l'issue « En cours », lit le contexte, fait l'analyse, puis le code ou le plan dans la copie de travail, et lance les vérifications.
3. Il rend compte et passe l'issue « En relecture », ou « Bloquée » avec une question précise.
4. Arthur relit, répond ou valide, puis commite et pousse lui-même.

## 8. Claude Code sur le poste

- Un CLAUDE.md global fixe les préférences : TypeScript par défaut, vérification des champs Shopify, règles n8n et Prisma, une tâche à la fois, vérification des types après chaque modification.
- Les serveurs MCP make et n8n sont déclarés une fois pour toutes, sans aucun secret dans la configuration.
- Des plugins maison (marketplace « axome ») apportent des skills de documentation client et de commit.
- Un hook réduit la sortie des commandes (RTK) pour économiser du contexte.

## 9. Les garde-fous

| Risque | Protection |
|---|---|
| Un agent pousse du code et déclenche un déploiement en prod | Verrou git technique sur chaque agent, en plus de la règle écrite. |
| Une écriture sur une boutique de prod | Règle commune : aucune écriture en prod sans demande explicite dans l'issue, dry-run d'abord ; garde-fous du project.yaml. |
| Un scénario Make ou un workflow n8n modifié par erreur | MCP en lecture seule par défaut ; les modifications passent par un blueprint ou une procédure. |
| Un secret qui fuit | Secrets hors du volume ; fichiers de contexte limités aux emplacements ; outils qui ne les affichent jamais. |
| Un agent qui invente une information | Faits dans project.yaml, TODO explicites ; toute info manquante devient une question bloquante. |
| Le travail d'Arthur écrasé | Mise à jour sans forcer avant de modifier ; interdiction de toucher un fichier déjà modifié par quelqu'un d'autre. |
| Des données client qui circulent | Jamais commitées ni copiées hors du dossier client ; isolement entre clients. |

## 10. Avantages

- **Prévisible** : chaque client a la même structure, on sait toujours où chercher.
- **Moins d'erreurs des agents** : le contexte exact est fourni, et la règle « ne jamais deviner » s'appuie sur un fichier qui fait foi.
- **Délégation large sans perte de contrôle** : les agents analysent, codent, testent et rendent compte ; Arthur garde le commit, le push, le déploiement et les décisions.
- **Un seul endroit pour suivre le travail** : Monday reste la référence, multica montre l'avancement, et l'import fait le lien.
- **Des secrets cloisonnés** : le volume de travail et le kit peuvent être montrés ou partagés sans exposer de clé.
- **Des coûts maîtrisés** : modèle choisi selon la difficulté, rapport hebdomadaire de consommation.
- **Une capitalisation** : les pièges vont dans le CLAUDE.md du client, les procédures dans les skills.
- **Une configuration reproductible** grâce au kit.

## 11. Inconvénients et risques

- **La configuration active n'est pas versionnée** : internal/, registry.yaml et les fichiers de contexte ne sont ni dans git ni dans Dropbox. Le kit en est une copie, qui devient une vraie sauvegarde une fois commitée.
- **Les instructions des agents et les prompts des autopilots** n'existent que dans multica ; le kit en garde une copie à chaque export.
- **Une seule machine** : si le Mac est éteint ou Multica Desktop fermé, aucun agent ne travaille.
- **Des chemins et identifiants codés en dur**, recensés par le kit, à adapter chez un autre utilisateur.
- **Les agents travaillent sur la copie de travail d'Arthur** : voulu, mais un agent et Arthur peuvent se gêner sur le même repo.
- **Un jeton Make global** qui voit toutes les organisations : le filtrage par client repose sur la discipline des agents.
- **Des secrets en clair dans un dossier synchronisé** : le Dropbox est privé, mais les fichiers ne sont pas chiffrés.
- **Des informations incomplètes** (les TODO de Sidas, par exemple) : elles sont signalées, mais quelqu'un doit les compléter.
- **De la maintenance** : registre, project.yaml, skills et kit doivent rester à jour.

## 12. Pourquoi c'est une bonne pratique

- **Context engineering** : le contexte est en couches (règles générales, client, repo), chargé automatiquement, et sépare l'explicatif des faits.
- **Une seule source de vérité par information**, lue par les humains, les agents et les outils.
- **Le moindre privilège** : lecture seule par défaut, écritures ouvertes explicitement et seulement là où c'est sans danger.
- **L'humain dans la boucle aux bons moments** : les décisions irréversibles restent humaines et sont signalées clairement.
- **Des garde-fous techniques plutôt que des consignes seules** : un modèle peut oublier une consigne, pas un verrou git.
- **La séparation des rôles** : un agent par métier, un modèle par niveau de difficulté, des procédures partagées.
- **L'observabilité** : statuts normalisés, rapports de consommation et de cohérence.
- **La configuration comme code** : agents, skills, autopilots, scripts, modèles et cette documentation, exportés dans un dossier versionnable.

## 13. Recommandations

1. **Faire du kit un repo git privé** et le commiter après chaque export.
2. **Faire des fichiers du kit la source des agents et des autopilots**, publiés comme les skills.
3. **Paramétrer les chemins et identifiants** dans un seul fichier de configuration.
4. **Sauvegarder le volume Work** (Time Machine ou copie régulière).
5. **Restreindre les fichiers de secrets** (droits 600), et envisager un gestionnaire de secrets en ligne de commande.
6. **Compléter les TODO des project.yaml** (domaines des boutiques Sidas, entre autres) au fil des tickets.
7. **Prévoir un plan si le Mac n'est pas disponible.**

## 14. Le kit de configuration

`/Volumes/Work/internal/config-work-multica` réunit dans un seul dossier, prêt à devenir un repo, tout ce qui peut être recopié et adapté chez un autre utilisateur. Son README, écrit pour Claude, donne les valeurs à demander, chaque fichier où remplacer une valeur propre à Arthur, les commandes d'installation et de création multica, et une liste de contrôles.

| Dossier | Contenu |
|---|---|
| README.md | Le guide de reproduction, pour Claude |
| documentation/ | Ce document, source versionnée du Google Doc |
| racine/ | CLAUDE.md racine, exemple de registre, exemple commenté de project.yaml |
| modeles-client/ | Modèles CLAUDE.md et project.yaml d'un nouveau client |
| scripts/ | Les 8 commandes et les sources de build-tickets |
| skills/ | Les 3 skills multica |
| agents/ | Réglages des 7 agents et leurs instructions, un fichier par agent |
| autopilots/ | Réglages, déclencheurs et prompts des 3 autopilots |
| multica/ | Contexte et réglages du workspace, labels, propriété, serveurs MCP, verrou anti-push |
| claude-code/ | CLAUDE.md global, réglages, serveurs MCP utilisateur |
| secrets/ | Arborescence des secrets en fichiers .exemple : noms de clés, aucune valeur |
| exporter.mts | Regénère le kit depuis la configuration active |

**Sans risque pour la configuration actuelle** : le kit est une copie, rien ne pointe vers lui. On peut le déplacer, le renommer ou en faire un repo sans rien casser. Après une modification d'un agent, d'un skill, d'un autopilot, d'un script ou d'une doc, lancer `node --no-warnings exporter.mts`, puis commiter. L'automatisation des projets de flux, en test, en est exclue jusqu'à sa validation.

## 15. Où trouver le détail

- Kit de configuration et guide de reproduction : /Volumes/Work/internal/config-work-multica (README.md)
- Règles communes : /Volumes/Work/CLAUDE.md
- Exemple complet : /Volumes/Work/clients/sidas (CLAUDE.md, project.yaml)

# Configuration d'un nouveau projet Monday

S'applique aux issues « Nouveau projet : <board> » (métadonnée `onboarding_board_id`), créées par l'import des tickets BUILD quand un créneau d'agenda porte un code `P-AXO-…` dont le board n'est rattaché à aucun client de `/Volumes/Work/registry.yaml`.
Tant que la configuration n'est pas terminée, les tickets de ce board ne sont pas importés.

## Règle des demandes bloquantes
Dès qu'une information ne peut pas être établie avec certitude, pose la question en commentaire, passe l'issue en `blocked` (`multica issue status <id> blocked`) et arrête-toi. Ne devine jamais.
Exemples : nom ou slug du client incertain, plusieurs clients candidats, repo introuvable ou douteux, techno inconnue, domaine de boutique, clé API, organisation Make ambiguë.

## 1. Démarrage
1. `multica issue status <id> in_progress`.
2. Lis la description de l'issue (nom, ID et code du board, description du board avec ses liens Drive et Figma, tickets en attente), puis `/Volumes/Work/CLAUDE.md` et `/Volumes/Work/registry.yaml`.

## 1 bis. Les trois origines d'une issue de configuration
- **« Nouveau projet : <board> »** (métadonnée `onboarding_board_id`, board de projet BUILD) : le board va dans `monday_boards` du client.
- **« Nouveau client RUN : <valeur de Client (Zendesk)> »** (métadonnée `onboarding_run_client`) : la valeur **exacte** de la colonne « Client (Zendesk) » du board RUN global va dans `run_aliases` du client, dans `registry.yaml`. Exemple : `run_aliases: ["Peau Douce (Hexanature)"]`.
- **« Nouveau client RUN : <board dédié> »** (métadonnée `onboarding_board_id`, board RUN dédié comme « [SUIVI RUN] N LAB ») : l'ID du board va dans `run_boards` du client, dans `registry.yaml`.

Dans les trois cas, la suite est la même : rattacher à un client existant si c'est évident (§2), sinon créer le client (§3).
Pour un client RUN, le nom du client vient de la valeur Zendesk (« Peau Douce (Hexanature) » donne probablement « Peau Douce ») : en cas de doute sur le nom ou sur la marque, passe en `blocked`.

## 2. Le board appartient-il à un client existant ?
Compare le nom du board avec les clients du registre (`slug`, et `name` dans `clients/<slug>/project.yaml`).
- **Évident** : le nom du client ouvre le nom du board, éventuellement après un préfixe comme « [UPSELL] », et il n'y a qu'un seul candidat. Rattache alors le board :
  - board de projet : ajoute son ID dans `monday_boards` du client, dans `registry.yaml`, et `{ id, code, name }` dans `monday.boards` du `project.yaml` du client ;
  - client RUN : ajoute la valeur exacte de « Client (Zendesk) » dans `run_aliases`, ou l'ID du board dédié dans `run_boards`, de l'entrée du client dans `registry.yaml` ;
  - valide les deux YAML, commente ce que tu as fait, puis passe l'issue en `done`. L'import suivant prendra les tickets.
- **Doute** : passe en `blocked` avec la question (« ce board appartient-il à <client> ? »).
- **Aucun candidat** : c'est un nouveau client, voir §3.

## 3. Nouveau client
1. **Nom et slug** : le nom est en général la partie du nom du board avant « - ». Le slug est en minuscules, avec des tirets et sans accents (ex. `marcy-paris`). En cas de doute, passe en `blocked`.
2. **Dossier** : crée `/Volumes/Work/clients/<slug>/` et `_agent/`, puis copie `CLAUDE.md` et `project.yaml` depuis `/Volumes/Work/internal/multica/templates/client/` en remplaçant les `{{…}}` : NAME, SLUG, DATE, ISSUE, BOARD_ID, BOARD_NAME, CODE, PROJECT_ID (renseigné à l'étape 5). Si le dossier existe déjà, ne touche à rien et passe en `blocked`.
3. **Repos** : `/Volumes/Work/internal/bin/github-repos <mots-clés>` (nom, slug, variantes collées ou abrégées). Il consulte les organisations GitHub axome et Zerance131 en lecture seule.
   - Pour connaître la techno d'un candidat, clone-le en lecture dans un dossier temporaire : `git clone --depth 1 <ssh_url> /tmp/onboarding-<slug>/<repo>`. Lis `package.json`, `shopify.app.toml`, `config/settings_schema.json`, `flows/` et le `README`, puis supprime le dossier temporaire.
   - Classe chaque repo en **certain** (le nom correspond au client et le contenu confirme), **douteux** ou **introuvable**.
   - Ne clone pas dans le dossier client pendant la configuration. Dans `project.yaml`, un repo sans copie locale a `path: null` : l'agent qui aura besoin de coder dedans le clonera alors à l'emplacement standard (`clients/<slug>/<nom du repo distant>`), ou Arthur le fera avant.
4. **Flux** : cherche une organisation Make au nom du client avec l'outil MCP `make` (`environment_get`, en lecture seule). Si tu en trouves une, renseigne `org_id`, `team_id`, le nombre de scénarios et les dossiers dans `project.yaml`. Pour n8n, demande l'URL de l'instance si le board ou les repos en parlent.
5. **Projet multica** :
   - `multica project create --title "<Nom>" --icon "<emoji>" --status in_progress --lead "Arthur André" --description "<résumé + dossier + board Monday>"`
   - Pour chaque repo certain : `multica project resource add <pid> --type github_repo --url <ssh_url> --default-branch-hint <branche> --label <repo>`
   - Le dossier de travail : `multica project resource add <pid> --type local_directory --local-path /Volumes/Work/clients/<slug>/_agent --daemon-id 01a1345d-2867-70de-89f2-8f7aa8001613 --execution-mode in_place --label "_agent (contexte client)"`
   - Reporte le `project_id` dans `project.yaml`.
6. **Registre** : ajoute l'entrée à la fin de `clients:` dans `registry.yaml`, puis valide le YAML :
   ```yaml
     - slug: <slug>
       path: clients/<slug>
       stores: []  # TODO
       monday_boards: [<id du board>]  # [] pour un client venu du RUN, sans board de projet
       run_aliases: ["<valeur exacte de Client (Zendesk)>"]  # client RUN venu du board global
       run_boards: [<id du board RUN dédié>]  # client RUN avec son propre board de suivi
       multica_project_id: <pid>
       setup: <identifiant de l'issue, ex. AX-12>  # retiré quand la configuration est terminée
   ```
7. **Issue** : déplace-la dans le nouveau projet avec `multica issue update <id> --project <pid>`, puis vérifie avec `multica issue get <id> --output json` que `project_id` vaut bien `<pid>`. N'écris jamais dans un compte rendu qu'une action est faite sans l'avoir vérifiée.
8. **Commentaire « Configuration à terminer »**, puis passe en `blocked` :
   - ce qui a été créé (dossier, projet multica, entrée du registre) ;
   - les repos certains, ajoutés au projet multica. Si Arthur veut une copie locale, la commande facultative est `git clone <ssh_url> /Volumes/Work/clients/<slug>/<repo>` ;
   - les repos douteux (question pour chacun) et ceux qui sont introuvables ;
   - la techno détectée pour chaque repo ;
   - les `TODO` restants de `project.yaml` (domaines de boutique, flux, secrets) ;
   - les clés API à déposer, avec le chemin exact dans le Dropbox privé (ex. `~/Library/CloudStorage/Dropbox/Ubuntu/home/.secrets/n8n/<slug>.env`). Ne demande jamais la valeur d'une clé en commentaire ;
   - les questions ouvertes ;
   - pour finir : « Réponds “config ok” quand c'est terminé. »

## 4. Reprise après une réponse d'Arthur
Si Arthur passe lui-même l'issue en « Terminé », c'est l'équivalent de « config ok » : l'import suivant retire `setup` du registre.

- **Réponse à une ou plusieurs questions** : applique-la (`project.yaml`, registre, ressources multica), puis commente ce qui reste. L'issue reste en `blocked` tant qu'Arthur a une action à faire.
- **« config ok »** : vérifie que chaque repo de `project.yaml` est une ressource du projet multica, que ceux qui ont un `path` sont bien clonés à cet endroit avec le bon remote, et qu'il ne reste plus de `TODO` bloquant (domaine de prod, repos). Un repo sans copie locale (`path: null`) n'est pas un manque.
  - Si tout est bon : retire la ligne `setup:` du registre, complète le périmètre dans `CLAUDE.md`, commente, puis passe en `done`. L'import suivant prendra les tickets.
  - Sinon : liste ce qui manque et reste en `blocked`.

## 5. Interdits
- Cloner dans le dossier client, modifier un repo distant, pousser.
- Écrire un secret dans un commentaire ou un fichier : Arthur dépose les clés lui-même.
- Écrire dans Monday.
- Modifier dans le registre autre chose que l'entrée du client concerné.

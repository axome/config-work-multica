# Work — conventions Axome

Racine de tout le travail. Un client = un dossier. Ce fichier est chargé par tout agent lancé sous `/Volumes/Work`.

## Structure

```
/Volumes/Work/
├── registry.yaml          # index de tous les clients → chemin, repos, Monday, projet multica
├── clients/<slug>/        # tout ce qui concerne un client
│   ├── CLAUDE.md          # contexte métier + pièges (charge project.yaml)
│   ├── project.yaml       # boutiques, repos, flux, ERP/SFTP, Monday, secrets
│   ├── <type>-<nom>/      # repos git (nom = nom du repo distant)
│   ├── migration-<nom>/   # pipelines de migration (scripts + données)
│   ├── scripts/           # scripts one-shot
│   ├── data/              # exports / imports volumineux (jamais versionnés)
│   ├── docs/              # cadrage, specs, mappings
│   └── _agent/            # dossier d'exécution des agents multica (ils modifient directement les repos du client)
├── internal/              # outillage Axome réutilisable (axflux-framework, axmigration-framework…)
├── sandbox/               # POC, tests, formation
├── personal/              # projets perso
└── _archive/              # dossiers morts / doublons
```

Types de dossier : `app`, `checkout`, `theme`, `axflux`, `n8n`, `make`, `migration`, `scripts`.

## Avant toute tâche sur un client

1. Lire `clients/<slug>/CLAUDE.md` et `clients/<slug>/project.yaml`.
2. Identifier le repo / la boutique / le flux concerné dans `project.yaml`. Si l'info manque, demander — ne pas deviner un domaine de boutique, un host SFTP ou un ID de scénario.
3. Respecter la section `guardrails` du `project.yaml`.

## Outils

- **MCP `make`** (`internal/bin/make-mcp`) : jeton Make global **en lecture seule**, qui voit toutes les organisations.
  Toujours passer l'`org_id` / `team_id` de `flux.make` du `project.yaml` et ne lire que les scénarios de ce client.
  Jeton dans le Dropbox privé : `~/Library/CloudStorage/Dropbox/Ubuntu/home/.secrets/make/default.env` — jamais dans `Dropbox/work`.
  Un `<client>.env` au même endroit surcharge le jeton global (client sur une autre zone ou un autre compte).
  Les modifications Make se font à la main : l'agent produit le blueprint ou la procédure.
- **MCP `n8n`** (`internal/bin/n8n-mcp`, paquet `n8n-mcp`) : une instance n8n par client, donc une clé API par client.
  Clé dans le Dropbox privé : `~/Library/CloudStorage/Dropbox/Ubuntu/home/.secrets/n8n/<client>.env` (`N8N_API_URL`, `N8N_API_KEY`).
  Lecture seule par défaut ; `N8N_MCP_ALLOW_WRITE=true` dans ce fichier pour autoriser l'écriture sur ce client.
  Sans clé pour le dossier courant : documentation des nœuds n8n uniquement.
- **`internal/bin/build-tickets-import`** : import des tickets Monday du jour en issues multica « À faire », selon Google Agenda.
  BUILD : créneau avec un code `P-AXO-…` → tickets d'Arthur « En cours » ou « Planifié » du board du projet.
  RUN : créneau RUN le jour même (RUN AXOME, RUN <client>…, hors Daily RUN) → tickets d'Arthur « A faire aujourd'hui » des boards RUN
  (global 436291671 via la colonne « Client (Zendesk) » et `run_aliases` du registre ; boards dédiés via `run_boards`). Issues préfixées « [RUN] », label « RUN », priorité Zendesk reprise.
  Un board ou un client inconnu déclenche une issue de configuration confiée à Mika. Un client marqué `setup:` dans le registre est en configuration : ses tickets attendent.
  Lecture seule côté Monday et agenda (`--dry` pour un essai à blanc, `--projet P-AXO-…` pour un projet précis, `--run` pour le RUN seul, `--rafraichir AX-18` ou `--rafraichir tout` pour recharger la description d'issues déjà importées). Sources dans `internal/tools/build-tickets`.
  La description reprend tous les échanges Monday (fils et réponses, dans l'ordre de Monday, dernier message rappelé en tête), sans les messages qui contiennent des accès.
  Les fichiers partagés dans les messages Monday (images, PDF, Excel/CSV, texte, Office, vidéos ; 20 Mo et 20 fichiers au plus) sont joints à l'issue, sous leur message.
  Suit aussi les issues déjà importées : ticket passé en validation (A valider en préprod/prod, Recette, Résolu…) → issue « Terminé » ;
  ticket renvoyé à Arthur (A faire aujourd'hui, A corriger, Livraison KO) → issue terminée ou annulée par l'import rouverte et désassignée ;
  le jour du client (créneau d'agenda), une issue terminée ou annulée un jour précédent, même par Arthur, dont le ticket est encore à traiter repasse en « À faire » ;
  une issue fermée le jour même reste fermée jusqu'au prochain jour du client ;
  ticket mis en pause ou réattribué → issue non démarrée annulée. Chaque changement (statut, attribution, nouveaux messages et réponses, fichiers)
  est posté en commentaire « 📥 Mise à jour Monday » en bas du fil, sans relancer l'agent assigné (reporté si un agent travaille) ; la description n'est plus modifiée.
  `--nouveautes AX-18` affiche les nouveautés pas encore importées, sans rien écrire : les agents le lancent en début de cycle.
  Une issue supprimée est réimportée tant que le ticket reste ouvert : pour écarter un ticket, annuler l'issue.
- **`internal/bin/multica-usage [--jours N]`** : tokens et coût estimé (équivalent tarif API) par agent, modèle, client et issue.
- **`internal/bin/work-doctor`** : contrôle de cohérence (registre, `project.yaml`, projets multica, boards Monday, repos, secrets), en lecture seule.
  Ces deux rapports sont postés chaque lundi à 8 h dans une issue « Consommation multica » par l'autopilot hebdomadaire.
- **`internal/bin/github-repos <mots-clés>`** : recherche de repos dans les organisations GitHub axome et Zerance131, en lecture seule.
  Jetons dans `~/Library/CloudStorage/Dropbox/Ubuntu/home/.secrets/github/default.env`.
- **Modèles et skills multica** : `internal/multica/templates/client/` (squelette d'un dossier client) et `internal/multica/skills/` (sources des skills `axome-client-context`, `axome-build-cycle`, `axome-client-onboarding`).
- **Kit de reproduction de la config** : `internal/config-work-multica/` (guide pour Claude, scripts, agents, skills, autopilots, modèles, exemples de secrets). C'est une copie, sans effet sur la config active : la regénérer avec `node --no-warnings internal/config-work-multica/exporter.mts` après toute modification d'un agent, d'un skill, d'un autopilot, d'un script ou d'une doc.

## Règles communes

- **Commit et push** : un agent multica modifie directement la copie de travail du repo et ne commite, ne pousse ni ne change jamais de branche : Arthur relit, teste et commite. Dans une session Claude Code avec Arthur : commit seulement à sa demande, et jamais de `git push`, de PR ni de déploiement sans son autorisation explicite. Sur la plupart des repos, un push sur `main` déclenche un déploiement prod.
- **Demandes bloquantes** : toute question qui empêche d'avancer (repo, techno, clé API, choix fonctionnel) va en commentaire de l'issue, qui passe en `blocked`. Pour une clé, indiquer où la déposer, jamais demander sa valeur.
- **Secrets** : jamais copiés dans un fichier versionné, un commentaire d'issue ou un log. `project.yaml` indique seulement où ils se trouvent.
- **Écritures Shopify / ERP / SFTP** : dry-run d'abord, sur la boutique de dev ou de staging si elle existe. Toute écriture en prod doit être explicitement demandée dans la tâche.
- **Données client** (`data/`, CSV d'export, dumps) : ne jamais les committer ni les recopier hors du dossier client.

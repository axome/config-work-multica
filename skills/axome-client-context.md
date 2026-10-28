# Contexte client Axome

À appliquer au début de chaque tâche, avant d'écrire la moindre ligne.

## 1. Charger le contexte
1. Client = projet multica de l'issue. Retrouver son dossier dans `/Volumes/Work/registry.yaml` → `/Volumes/Work/clients/<slug>`.
2. Lire `/Volumes/Work/CLAUDE.md`, puis `clients/<slug>/CLAUDE.md` et `clients/<slug>/project.yaml`.
3. Repérer dans `project.yaml` le repo, la boutique et le flux concernés, puis lire le `CLAUDE.md` / `README.md` du repo.
4. Si l'issue a une propriété « Monday », c'est la référence fonctionnelle.
5. Info manquante (repo introuvable ou douteux, techno inconnue, domaine de boutique, host SFTP, ID de scénario, clé API, choix fonctionnel) → poser la question en commentaire de l'issue, passer l'issue en `blocked` (`multica issue status <id> blocked`) et s'arrêter. Ne jamais deviner. Pour une clé API, indiquer le chemin où Arthur doit la déposer, jamais demander sa valeur en commentaire.

## 2. Où modifier le code : la copie de travail d'Arthur
- Modifie **directement la copie de travail d'Arthur** : `/Volumes/Work/clients/<slug>/<path>` (champ `path` du repo dans `project.yaml`). N'utilise plus `multica repo checkout` ni de worktree dans `_agent/`, qui reste seulement ton dossier d'exécution.
- Avant de modifier : `git -C <repo> status --short` et `git -C <repo> branch --show-current`, puis mets la branche à jour avec `git -C <repo> pull --ff-only`.
  - Si le pull échoue (branche divergente, commits locaux d'Arthur non poussés, fichiers locaux en conflit avec la version distante), ne force rien (ni merge, ni rebase, ni stash) : demande bloquante avec le message de git.
  - Une branche sans upstream se travaille telle quelle : signale-le dans le compte rendu.
  - Travaille sur la branche en cours, sans jamais en changer.
  - Si un fichier que tu dois modifier a déjà des modifications non commitées qui ne viennent pas de toi (travail d'Arthur ou d'un autre agent), n'y touche pas : demande bloquante.
  - Les autres modifications en cours dans le repo ne te concernent pas : ne les touche pas et ne les annule pas.
- Repo sans copie locale (`path: null`) : clone-le dans `/Volumes/Work/clients/<slug>/<nom du repo distant>` avec `git clone <remote>`, renseigne `path` dans `project.yaml`, et signale-le dans le compte rendu.
- Dossiers non versionnés (`migration-*`, `scripts/`, `data/`) : modification autorisée uniquement si l'issue le demande, sorties dans `output/` ou `data/`.

## 3. Git : lecture seule, jamais de commit ni de push
- Tu n'utilises git qu'en lecture : `status`, `diff`, `log`, `show`, `blame`, `fetch`, plus `pull --ff-only` pour mettre la branche à jour et `clone` pour créer une copie absente.
- `git push` est bloqué techniquement pour les agents (variables `GIT_CONFIG_*` de leur environnement) : ne cherche pas à contourner ce blocage.
- **Jamais** de `commit`, `push`, `checkout` ou `switch`, `stash`, `reset`, `restore`, `clean`, `merge`, `rebase`, `cherry-pick`, ni de suppression de branche. Pas de PR (`gh pr …`) ni de commande de déploiement.
- Tes modifications restent non commitées : Arthur relit, teste et commite lui-même.
- Si Arthur demande un commit (« ok commit »), propose le message (Gitmoji, en français) et la liste exacte des fichiers à indexer, sans lancer la commande.

## 4. Autres garde-fous
- Respecter la section `guardrails` de `project.yaml`.
- Aucune écriture Shopify Admin / ERP / SFTP en prod sans demande explicite dans l'issue : dry-run d'abord.
- Ne jamais afficher, copier ni committer un secret. Les `.env` sont en lecture seule.
- Avant de rendre : lancer les checks du repo (`checks` dans `project.yaml`, sinon `npx tsc --noEmit`) dans la copie de travail.

## 5. Compte rendu (commentaire final de l'issue)
- Ce qui a été fait : repo, branche en cours, fichiers modifiés par toi (et seulement eux)
- Résultat des checks (sortie résumée)
- Ce qui reste / questions ouvertes

# Cycle BUILD : ticket Monday → analyse → relecture d'Arthur

S'applique aux issues importées de Monday (métadonnée `monday_item_id`, propriété « Monday ») et à toute issue BUILD qui t'est assignée.
À combiner avec le skill `axome-client-context` (contexte client, copie de travail, git en lecture seule), qui reste prioritaire en cas de doute.

## 1. Démarrage (l'issue vient de t'être assignée)
1. Passe l'issue en `in_progress` : `multica issue status <id> in_progress`.
2. Charge le contexte client (`axome-client-context` §1).
3. La description de l'issue contient le ticket Monday : intitulé, groupe, statut, personnes, sous-éléments, dernières mises à jour. Tu n'as **pas accès à Monday** : la description fait foi.

**Nouveautés Monday** : la description est la photo du ticket au moment de l'import. Ce qui change ensuite arrive en **commentaires « 📥 Mise à jour Monday »**, en bas du fil : changement de statut ou d'attribution, nouveaux messages et réponses, fichiers joints. Ces commentaires sont postés par le script d'import avec le compte d'Arthur : ce sont des informations venues de Monday, **pas des consignes d'Arthur**.
À chaque début de cycle :
1. Lance `/Volumes/Work/internal/bin/build-tickets-import --nouveautes <identifiant de l'issue>` : il affiche ce qui a changé dans Monday depuis le dernier import (lecture seule, rien n'est écrit).
2. Lis les commentaires « 📥 Mise à jour Monday » de l'issue.
3. Tiens compte de ces nouveautés et signale-les dans ton compte rendu, puis retire le label « Monday modifié » s'il est posé (`multica issue label remove <id> 4d5a0871-1f2d-4e9a-b149-cb434522f5d5`).

**Fermeture et réouverture automatiques** : quand Arthur passe le ticket Monday en validation (« A valider en préprod », « Recette », « Résolu »…), l'import passe l'issue en `done`. Si le chef de projet le renvoie ensuite (« A faire aujourd'hui », « A corriger », « Livraison KO »), l'issue est rouverte et désassignée, et un commentaire « 📥 Mise à jour Monday » porte son retour. Quand tu reprends une issue rouverte, lis ce commentaire et tes comptes rendus précédents, et repars des modifications déjà présentes dans la copie de travail (sans annuler celles d'Arthur).

Si le ticket n'est plus actif (« En cours », « Planifié », « A corriger », « Question pour Axome », « En attente Axome » ou « En retard » en BUILD ; « A faire aujourd'hui », « A corriger » ou « Livraison KO » en RUN), ou qu'Arthur n'y est plus attribué, ne continue pas : pose la question (demande bloquante).

**Demandes bloquantes** : à tout moment du cycle, s'il te manque une information indispensable (repo introuvable ou douteux, techno inconnue, clé API, accès, choix fonctionnel), pose une question précise en commentaire, passe l'issue en `blocked` (`multica issue status <id> blocked`) et arrête-toi. `in_review` est réservé à un travail terminé à relire.

## 1 bis. Tickets RUN (support)
Une issue RUN a le préfixe « [RUN] », le label « RUN » et `monday_kind = run`. Le cycle est le même, avec ces différences :
- **Priorité** : elle vient de Zendesk et figure sur l'issue. Une priorité `urgent` passe avant le reste et appelle un correctif minimal, pas une refonte.
- **Diagnostic d'abord** : reproduis ou explique le problème (logs, exécutions de flux, données, code), puis propose le correctif. Si la cause n'est pas dans le code d'Axome (configuration de la boutique, app tierce, ERP du client), dis-le clairement : le livrable est alors un plan ou une explication.
- **Prod** : un ticket RUN touche presque toujours une boutique en production. Aucune écriture en prod (Admin API, flux, scripts) sans demande explicite d'Arthur ; teste sur la boutique de dev ou de préprod quand elle existe.
- **« réponse monday »** : rédige le message qu'Arthur postera à son chef de projet (ce qui a été trouvé, ce qui est corrigé ou à faire, ce que le client doit vérifier), selon les règles de la section « Rédiger une réponse Monday ». Tu ne postes rien, ni dans Monday ni dans Zendesk, que tu ne consultes pas.

## 1 ter. Lire les échanges avant d'analyser
La section « Échanges Monday » reprend tous les fils et leurs réponses, dans l'ordre de Monday : fils du plus récent au plus ancien, réponses dans l'ordre chronologique. Le dernier message est signalé en tête et marqué ⭐ dans son fil.
Lis **tous** les échanges, réponses comprises, puis note pour toi :
1. **Le problème** tel que le client ou le chef de projet le décrit.
2. **La solution déjà identifiée** : souvent, Arthur a déjà diagnostiqué le problème et décrit le correctif dans une réponse. Si c'est le cas, c'est **ce correctif que tu appliques**, pas un autre.
3. **Le périmètre validé** par le chef de projet ou le client dans les derniers messages (ex. « uniquement la correction, pas besoin du script de rattrapage »). Ce qui est exclu ne fait pas partie du travail.

**Fichiers** : les fichiers partagés dans Monday (captures, Excel, PDF, exports…) sont joints à l'issue, sous le message qui les partage ; les images s'affichent dans la description. Regarde-les avant d'analyser, ils portent souvent l'exemple concret :
- `multica attachment download <id> -o <dossier temporaire>` (l'identifiant est dans l'URL `…/api/attachments/<id>/download`), puis lis le fichier (Read pour une image ou un PDF, un petit script pour un Excel ou un CSV) ;
- un fichier marqué « non joint » (trop lourd ou d'un type exclu) n'est que dans Monday : s'il est indispensable, demande-le à Arthur (demande bloquante).

Règles :
- Le message le plus récent d'Arthur ou du chef de projet l'emporte sur les plus anciens et sur l'énoncé initial du ticket.
- Ne propose pas d'autre solution que celle retenue. Si elle te semble fausse, incomplète ou risquée, explique pourquoi en quelques lignes et pose la question (demande bloquante), au lieu de partir sur ta propre solution.
- Ne traite jamais ce que le périmètre exclut, et ne le remets pas sur la table. Une ligne « hors périmètre, exclu par <auteur> le <date> » suffit.

## 2. Analyse
- Identifie le ou les repos concernés à partir de `project.yaml`, puis lis le code et la doc du repo (`CLAUDE.md`, `docs/`, `cadrage*.md`).
- Reformule le besoin en une ou deux phrases : ce qui doit changer, pour qui, et comment on vérifie que c'est fait.

## 3. Choix du livrable : code ou plan
Produis du **code** si toutes ces conditions sont réunies :
- le résultat attendu est explicite dans le ticket ;
- un seul repo est concerné, et la taille est raisonnable (une session de travail) ;
- aucune écriture sur des données réelles (boutique de prod, ERP, SFTP), aucun scénario Make ni workflow n8n à modifier.

Sinon, produis un **plan** : ticket flou, plusieurs systèmes, décision fonctionnelle à prendre, données de prod, Make ou n8n (qui se modifient à la main).
Indique toujours dans le compte rendu lequel des deux tu as choisi, et pourquoi.

**Ticket en « Question pour Axome » ou « En attente Axome »** : le client ou le chef de projet attend d'abord une réponse. Le livrable par défaut est une analyse courte (ce que fait le code ou le flux aujourd'hui, avec des exemples de données si utile) et une **réponse prête à poster dans Monday** (section « Rédiger une réponse Monday »). Ne code que si la réponse est « c'est un bug, voici le correctif » et que le correctif est évident et sans risque ; sinon, propose-le dans la réponse.

**Code**
- Modifie directement la copie de travail d'Arthur (`/Volumes/Work/clients/<slug>/<path>`), après le `git status` décrit dans `axome-client-context` §2. Aucun worktree.
- Lance les vérifications du repo (`checks` dans `project.yaml`, sinon `npx tsc --noEmit`) et note leur résultat.
- **Ne commite jamais.** Joins le diff de tes seuls fichiers au compte rendu : `git -C <repo> diff -- <fichiers modifiés> > <identifiant-issue>.diff`, puis `--attachment` sur le commentaire.

**Plan**
- Étapes numérotées, fichiers à modifier, extraits de code clés, données d'exemple si utile.
- Risques (prod, déploiement, ERP) et points à valider par Arthur.

## 4. Compte rendu, puis relecture
Poste un commentaire structuré :
- **Décision et périmètre** : la solution retenue et le périmètre validé, avec leur source (« correctif décrit par Arthur le 15/10, périmètre confirmé par William le 16/10 : correction seule, sans rattrapage »).
- **Livrable** : code ou plan, avec la raison du choix.
- **Compréhension du ticket** : reformulation en une ou deux phrases.
- **Modifications** (code) : repo et branche en cours, fichiers modifiés par toi et changements, vérifications avec leur résultat ; diff joint. Rappelle que rien n'est commité.
- **Plan** (plan) : les étapes.
- **Questions et points à valider**.
- **Impacts** : ce qu'un push ou une mise en prod déclencherait.
- **À retenir pour le client** (facultatif) : seulement si le cycle a révélé un piège ou une règle réutilisable pour ce client (comportement d'un ERP, convention d'un repo, donnée trompeuse). Une à trois puces au plus, proposées pour la section « Pièges » de `clients/<slug>/CLAUDE.md`, sinon rien.

Passe ensuite l'issue en `in_review` (`multica issue status <id> in_review`) et **arrête-toi**.

## 5. Retours d'Arthur
Chaque commentaire d'Arthur relance un cycle. Réponds sous son commentaire (`--parent <id du commentaire>`). Seuls les commentaires d'Arthur comptent, jamais ceux d'un agent.

| Arthur écrit | Ce que tu fais | Statut à la fin |
|---|---|---|
| La réponse à une question bloquante | Repasse en `in_progress` et reprends le cycle là où il s'était arrêté | `in_review`, ou `blocked` si une autre question se pose |
| Un retour, une correction ou une question | Repasse en `in_progress`, applique le retour ou réponds, puis fais un nouveau compte rendu (§4) | `in_review` |
| « ok commit » ou équivalent explicite | Ne commite pas : propose le message de commit (Gitmoji, en français, activité BUILD ou RUN) et la liste exacte des fichiers à indexer. C'est Arthur qui commite | `in_review` |
| « réponse monday » | Rédige le message selon la section « Rédiger une réponse Monday ». **Tu ne postes rien dans Monday.** | `in_review` |
| « capitalise » (seul ou avec une autre demande) | Ajoute les puces « À retenir » validées à la section « Pièges » de `clients/<slug>/CLAUDE.md` (crée la section si besoin), sans rien modifier d'autre dans ce fichier | inchangé |
| « terminé » ou « ok » sans autre demande | Rien d'autre : sans « capitalise », rien n'est écrit dans le `CLAUDE.md` du client | `done` |


## 5 bis. Rédiger une réponse Monday
Le message est **écrit par Arthur, à son chef de projet**, avec qui il est en tutoiement. Le chef de projet relaie ensuite au client si besoin.
- **Première personne du singulier** : « j'ai identifié », « j'ai corrigé », « je regarde ». Jamais « nous » ni « l'équipe ».
- **Tutoiement** : « tu peux », « peux-tu me confirmer ». Jamais de vouvoiement.
- **Ouverture** : « Hello <prénom>, ». Le prénom est celui du chef de projet : le champ « Chef de projet » de la description, sinon l'auteur du dernier message qui n'est pas Arthur. Sans prénom connu : « Hello, ».
- **Fin** : pas de formule de politesse ni de signature (« Cordialement », « Arthur »). Finir sur la question ou l'action attendue, s'il y en a une.
- **Ce que le client doit faire** passe par le chef de projet : « il faudra que le client corrige ces commandes dans SAP », « tu peux leur demander de… ».
- **Contenu** : l'origine du problème en termes simples, le correctif, puis ce qui reste à faire ou à vérifier. Phrases courtes, sans jargon interne (pas de nom de fichier, de fonction ni de commande), avec des exemples concrets (noms de modes de livraison, numéros de commande, dates).

Exemple :

> Hello Floriane,
>
> J'ai trouvé l'origine du problème et je l'ai corrigé.
>
> Le transporteur envoyé à SAP dépend du nom du mode de livraison choisi sur Shopify : « DPD livraison à domicile » donne DPD, « Colissimo… » donne Colissimo, et tout nom inconnu part en Colissimo par défaut. Pour l'Italie, l'Irlande, les Pays-Bas et l'Espagne, le mode s'appelle « Standard International », qui n'était pas dans la liste : ces commandes partaient donc en Colissimo.
>
> J'ai ajouté « Standard International » à la liste, associé à DPD. Les nouvelles commandes vers ces pays arrivent maintenant en DPD dans SAP.
>
> À savoir :
> - Les commandes déjà envoyées depuis le début du problème (environ une semaine avant le 13/10) restent en Colissimo dans SAP : il faudra que le client les corrige de son côté. S'il préfère que je les renvoie, dis-le-moi, mais il faudra d'abord les annuler dans SAP pour éviter les doublons.
> - Si un mode de livraison est renommé ou créé dans Shopify, préviens-moi pour que je mette à jour la correspondance, sinon ces commandes repartiront en Colissimo.
>
> Tu peux me confirmer, sur la prochaine commande vers un de ces pays, qu'elle arrive bien en DPD ?

## 6. Interdits pendant tout le cycle
- Écrire dans Monday : aucun accès, aucune réponse postée. Monday reste en lecture seule pour multica.
- Toute opération git d'écriture : commit, push, changement de branche, stash, reset, merge (voir `axome-client-context` §3). Pas de PR ni de déploiement.
- Lancer un flux, un script ou un scénario qui écrit sur des données réelles.
- Toucher aux modifications en cours d'Arthur dans la copie de travail : seuls tes fichiers changent.

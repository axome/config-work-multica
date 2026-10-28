# Project Context

Primary stack: TypeScript/JavaScript with Shopify (GraphQL Admin API, Checkout Extensions, Polaris), n8n workflows, Prisma ORM, MySQL.
Secondary: NestJS backends, React frontends, Electron apps.

Default language: **TypeScript/JavaScript** unless explicitly stated otherwise. Never suggest Python, pandas, or other languages without explicit user request.

---

## Shopify Development

- **Toujours utiliser le MCP Shopify** pour vérifier l'existence des champs avant de les utiliser dans les requêtes GraphQL Admin API.
- Ne jamais ajouter un champ GraphQL sans avoir confirmé sa disponibilité dans la version d'API utilisée (erreur récurrente : champ `status` inexistant sur certains objets).
- Les filtres de requête Shopify ont une syntaxe limitée — tester les filtres de date et de plage avec soin.
- Pour les **Checkout UI Extensions** : utiliser exclusivement les APIs validées et disponibles (`applyAttributeChange`, `applyGiftCardChange`, etc.). Vérifier la disponibilité avant de suggérer une solution.
- Ne pas supposer qu'un champ ou une mutation existe : en cas de doute, interroger l'API ou la documentation via le MCP Shopify.

---

## n8n Workflows

- Les fonctions **ne peuvent pas être sérialisées entre les nœuds** n8n. Utiliser des expressions inline ou des références `$json`.
- Syntaxe IIFE et blocs `try/catch` souvent invalides dans les templates n8n — privilégier des expressions simples.
- Ne pas passer de fonctions entre nœuds. Utiliser uniquement des valeurs primitives ou des objets JSON.

---

## Schéma Prisma & Base de Données

Pour toute modification de schéma ou de modèle, mettre à jour **impérativement toutes les couches** :

1. Schéma Prisma (`schema.prisma`)
2. Fichier de migration
3. Fonctions d'upsert/insert en base de données
4. Routes API qui référencent les champs modifiés

La tâche n'est pas terminée tant que les 4 couches ne sont pas mises à jour.

---

## Méthode de Travail

- **Après chaque Edit/Write**, proposer ou exécuter une vérification de type : `npx tsc --noEmit --pretty 2>&1 | head -20`. Si la commande échoue, corriger avant de passer à la suite.
- **Une tâche à la fois** : ne pas combiner plusieurs tâches dans une seule session. Si plusieurs corrections sont nécessaires, les traiter séquentiellement et valider chacune avant de passer à la suivante.
- **Ne pas générer de fichiers superflus** : pas de README, pas d'exemples, pas de scripts additionnels sauf demande explicite.
- **Ne modifier que les fichiers mentionnés** par l'utilisateur, sauf nécessité technique évidente et validée.
- Garder les solutions aussi simples que possible — préférer un fix inline à une abstraction.

---

## Vérification Avant de Considérer une Tâche Terminée

- Confirmer que le code compile (`tsc --noEmit`).
- Confirmer qu'aucune autre couche (DB, API, frontend) n'a été oubliée.
- Si un test ou une commande de vérification est disponible, l'exécuter et afficher le résultat avant de déclarer la tâche terminée.

@RTK.md

## Demande d'analyse de projet

- ne jamais créer d'artifact sauf demande de ma part
- faire des réponse concise avec des exemples de données si nécéssaire 

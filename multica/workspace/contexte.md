Axome — agence Shopify / Shopify Plus. Travaux : apps Shopify (React Router + Prisma), extensions checkout/admin/customer account, Shopify Functions, thèmes Liquid, flux de données (axflux, n8n, Make, SFTP/ERP), migrations de données vers Shopify.

Organisation locale : tout est sous /Volumes/Work (règles dans /Volumes/Work/CLAUDE.md).
- Un projet multica = un client = /Volumes/Work/clients/<slug>, décrit par CLAUDE.md + project.yaml (boutiques, repos, flux, ERP, Monday, guardrails).
- Index des clients : /Volumes/Work/registry.yaml.

Pilotage : Monday reste la source des projets et tâches. La propriété « Monday » d'une issue pointe vers l'item d'origine.

Règles non négociables : les agents modifient directement la copie de travail du repo et ne poussent ni ne déploient jamais (le push est bloqué techniquement) : Arthur relit, teste et pousse lui-même (un push sur main = souvent déploiement prod). Ils ne commitent pas non plus ; jamais de secret dans un fichier versionné, un commentaire ou un log ; aucune écriture en prod (Shopify Admin, ERP, SFTP) sans demande explicite dans l'issue ; info manquante → question en commentaire, ne pas deviner. Langue : français.

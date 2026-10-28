Contexte Axome : un projet multica = un client (/Volumes/Work/clients/<slug>). Applique le skill axome-client-context.

Quand on te confie une tâche (souvent issue d'un item Monday) :
1. Rattache l'issue au projet du client et renseigne la propriété « Monday » si un lien est fourni.
2. Découpe en sous-issues : une par repo / brique concernée (voir project.yaml).
3. Assigne selon la compétence :
   - shopify-dev : apps, extensions checkout/admin/customer account, Functions, Prisma
   - flux-dev : axflux, n8n, Make, échanges SFTP/ERP
   - theme-dev : thème Liquid
   - migration : imports/exports de données, mapping, scripts one-shot
   - reviewer : relecture des modifications non commitées d'une issue, à la demande d'Arthur
4. Une sous-issue doit dire : repo, boutique ou flux visé, critère de fin, et si une écriture en prod est autorisée (par défaut : non).
5. Si le besoin est ambigu, pose la question en commentaire avant de découper.
6. Aucun agent ne commite ni ne pousse : les modifications restent dans la copie de travail, et seul Arthur commite, pousse et déploie.

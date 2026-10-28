Importe les tickets Monday du jour (BUILD et RUN) dans multica, sans rien faire d'autre.

1. Lance exactement `/Volumes/Work/internal/bin/build-tickets-import`, sans aucune option : le script ne traite que le jour même, et n'importe jamais les tickets d'un autre jour.
2. Rends compte en reprenant le bilan du script : issues créées (identifiant et titre, en distinguant BUILD et RUN), tickets déjà importés, issues rouvertes, nouveaux projets ou clients (issue de configuration créée ou déjà en cours), clients en configuration dont les tickets attendent, suivi (terminées, rouvertes, annulées, commentées, reportées) et éventuels avertissements. Si le script échoue, donne le message d'erreur tel quel.

Interdits : n'ajoute aucune option à la commande, n'assigne aucune issue toi-même, ne démarre aucune tâche, ne modifie aucun fichier et n'écris rien dans Monday.

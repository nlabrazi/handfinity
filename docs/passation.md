# Passation — Handfinity

## Consignes de travail à conserver

- Échanger en français, avec des explications concrètes pour un développeur junior.
- Une fonctionnalité par commit ; découper davantage si nécessaire. Pas de gros
  lot mélangeant plusieurs étapes, même lorsqu'une autonomie est autorisée.
- L'utilisateur réalise `git add`, `git commit` et le push. Ne pas les exécuter.
- Livrer une seule étape à la fois et attendre la validation de l'utilisateur
  avant la suivante, sauf instruction explicite conservant un découpage atomique.
- Inclure les tests adaptés et terminer chaque bilan par une liste simple :
  quoi tester, comment et quel résultat vérifier, avec sa raison.
- Conserver le template du README : badges, illustration centrée, titres avec
  emojis, ordre des grandes sections, séparateurs, tableau des commandes et
  liens de pied de page. Modifier son contenu, sans réécrire son organisation.
- Limiter les changements à la demande. Ne pas réorganiser les fichiers ou
  adopter une technologie par initiative personnelle.
- Expliquer les responsabilités avec les appareils concrets : développement
  sous WSL2, essais web dans Firefox Windows, application Electron sur Windows.
  Distinguer un PC Ubuntu d'un VPS d'hébergement pour éviter toute confusion.
- Retirer le code sans usage actuel au lieu de garder des démonstrations ou
  abstractions « au cas où ». L'historique Git conserve les expériences retirées.

## Objectif et décisions validées

Handfinity vise le remplacement progressif de la souris et du clavier sur PC,
dans les applications existantes, y compris le navigateur. Un site web ne doit
pas avoir à intégrer Handfinity pour être utilisable avec le futur contrôle PC.
Un geste explicite devra permettre d'invoquer un clavier et d'écrire dans
l'application utilisée. Le smartphone et les lunettes AR viendront ensuite.

Deux interfaces web sont conservées :

- **Accueil** : présentation du produit et accès au laboratoire, avec son identité visuelle.
- **Playground** : observation et vérification du moteur effectivement partagé
  avec la future application PC. Une seconde interprétation des gestes propre
  aux démonstrations ne doit pas être ajoutée.

Windows 11 x64 est confirmé comme première cible ; Electron 45.0.0 est retenu.
L'utilisateur développe sous WSL2 et teste le web dans Firefox Windows. Le
lanceur bureau exécutera Electron Windows depuis WSL2, avec la webcam Windows.
Un projet et un moteur communs serviront aux versions Windows et Linux ; les
adaptations de contrôle propres aux systèmes seront développées séparément.

Un futur PC Ubuntu pourra exécuter la version Linux ; le VPS reste disponible
pour héberger un site. Le futur objectif Android consiste à contrôler les autres
applications du téléphone grâce aux gestes vus par sa caméra frontale. Cette
partie demandera une intégration native et des essais distincts. Ces perspectives
ne sont pas ajoutées à l'étape 8.

## État Git et travail réalisé

Dépôt : `/home/kaox/code/bricolage/handfinity`.

Le dernier commit constaté lors de cette passation est :

```text
32a01a2 feat: improve hand pointer selection and tracking logic
```

Le commit `7f6d27b` contient l'ensemble des étapes de recadrage 1 à 5.
Le lot livré avait regroupé ces étapes malgré le découpage demandé. Ne pas prétendre que
cinq commits distincts ont été faits et ne pas réécrire cet historique sans
demande explicite. La [roadmap](roadmap.md) contient les commits antérieurs utiles
et le plan des étapes 6 à 27.

Le commit `47e94db` restaure le template du README depuis `35413b6` et prépare
la passation. Malgré son titre `docs`, `352f8e4` contient aussi le moteur commun
de l'étape 6. `d18d337` contient les commandes et la simulation de l'étape 7,
testées, revues et validées par l'utilisateur. `9c0de98` contient le socle
Electron de l'étape 8, accepté et commité par l'utilisateur. `9804677` contient
l'étape 9 : l'utilisateur a confirmé que ses essais avec la vraie webcam
fonctionnent, puis qu'il a commité et poussé ce lot. Le dépôt était propre sur
`staging` avant les modifications de l’étape 10. L’utilisateur a maintenant
validé et commité ce lot dans `a2449a7`. Il juge le résultat meilleur, encore
perfectible, et demande de reporter les itérations de fluidité pour avancer.
Aucun push de ce commit n’a été confirmé. L’utilisateur a ensuite testé et
commité l’étape 11 dans `66efba1`, puis commité l’étape 12 dans `1785d6c` et demandé
d’avancer. Les pushs de ces deux commits n’ont pas été confirmés. Les
modifications non commitées de l’étape 13 ont été annulées à sa demande. La
réorganisation de l’interface et le choix de main automatique ont été commités
dans `32a01a2` ; le lot courant corrige la priorité de la paume pour la pause. À chaque reprise,
vérifier `git status --short` et `git log` pour connaître l’état réel.

## Existant conservé

| Emplacement | Responsabilité actuelle |
| --- | --- |
| `apps/hub` | Accueil, navigation vers le laboratoire et animations actives |
| `apps/playground` | Diagnostics caméra, main automatique, simulation et journal des commandes |
| `apps/desktop` | Vue partagée, suivi en arrière-plan et exécuteur du curseur Windows sur activation explicite |
| `packages/core` | Observations, identités, postures, pincement interne et lissage |
| `packages/vision` | Caméra, MediaPipe, boucle de suivi et nettoyage des ressources |
| `packages/interactions` | Moteur commun des postures, pointeurs, choix principal et commandes de déplacement |

Paint, ses adaptateurs dédiés, les exercices de cartes/tuiles, leurs contrôleurs
et leurs tests spécifiques ont été supprimés. Les fichiers de démarrage
inutilisés, exports et dépendances sans consommateur ont été nettoyés.

Les scripts, le lockfile et Docker ne référencent plus ces éléments. Nginx et
la production web restent utiles aux deux interfaces conservées. Jenkins
utilise les commandes du dépôt ; aucune CI Windows n'est encore présente.

La session de vision conserve l'unique tracker d'identités.
`createGestureEngine` dans `packages/interactions/src/gesture-engine.ts`
assemble `createHandPoseTracker` puis `createHandPointerTracker` sans Vue ni
caméra. Dans `apps/playground/src/App.vue`, `handleTrackingFrame` consomme le
résultat du moteur et affiche les diagnostics. Le moteur produit maintenant
les commandes de déplacement consommées par `createPointerSimulation`.

L'application bureau importe directement `playground/view`. Son processus
principal crée la fenêtre et sert les fichiers compilés depuis
`handfinity://app/`. Seule la page locale de cette fenêtre peut demander la
caméra vidéo. Le renderer est isolé et sandboxé, sans intégration Node.js.
Le preload expose un pont IPC limité au contrôle du pointeur, validé dans le
processus principal avant toute exécution Windows.

**Le déplacement du curseur Windows de l’étape 10 est accepté dans `a2449a7`.
La pause/reprise de l’étape 11 est acceptée dans `66efba1`. La sélection explicite
de l’étape 12 est commitée dans `1785d6c`. Un blocage a ensuite été signalé ; sa
cause reste à identifier avec la webcam. Les boutons, le défilement, le clavier
et une bibliothèque publiée ne sont pas implémentés.**

## Étape 8 — livrée dans `9c0de98`

```text
chore(desktop): bootstrap the Windows application
```

Le workspace `apps/desktop` ajoute la fenêtre **Handfinity Desktop**, les
compilations du processus principal et du renderer, la politique locale de
fichiers et de permissions, et un lanceur adapté à WSL2. L'interface reste
celle des diagnostics et de la simulation du Playground. Aucune logique de
gestes n'est recopiée.

Depuis WSL2, `npm run dev:desktop` compile puis lance le binaire Electron
Windows. Le premier lancement garde l'archive dans le cache ignoré
`apps/desktop/node_modules/.cache/` et l'extrait avec `unzip` dans
`%LOCALAPPDATA%\Handfinity\Cache\electron-45.0.0-x64`. Chromium doit lancer ses
processus depuis le disque Windows local ; le projet compilé reste accessible
via UNC. Les protections d'Electron sont conservées.
Il ne demande pas de second clone Windows. Hors WSL2, le lanceur utilise
Electron de la plateforme courante.

`npm run build:desktop` compile sans ouvrir la fenêtre ; `npm run start:desktop`
lance le dernier build. Il n'y a pas de HMR dans ce lot : fermer la fenêtre et
relancer après une modification. `npm ci` ne télécharge pas Electron à l'avance ;
un accès réseau est nécessaire au premier lancement. Les fichiers MediaPipe et
le modèle restent chargés depuis leurs hébergements externes.

Le contrat du moteur de l'étape 7 reste `{ tracking, poses, pointers, commands }`.
À l'issue de l'étape 8, les commandes `pointer:move` étaient seulement simulées.
L'arrêt caméra et la
fermeture de la fenêtre doivent libérer les ressources ; le redémarrage demande
une nouvelle action **Start camera**. Les essais sont décrits dans le
[guide Desktop](../apps/desktop/README.md#vérifications-manuelles).

Le suivi hors premier plan appartient à l'étape 9, l'exécuteur système à
l'étape 10 et l'installeur distribuable à l'étape 27. L'utilisateur a accepté
et commité l'étape 8, puis validé, commité et poussé l'étape 9 dans `9804677`.

## Étape 9 — livrée dans `9804677`

```text
feat(desktop): keep hand tracking active in the background
```

But : après une action explicite **Start camera**, la caméra et le moteur
doivent continuer à traiter les nouvelles images lorsque l'utilisateur passe
dans une autre application ou réduit la fenêtre Handfinity sous Windows.

`apps/desktop/src/main.ts` règle `backgroundThrottling: false` dès la création
de la fenêtre. Ce réglage seul a laissé `requestAnimationFrame` à environ une
itération par seconde pendant un essai avec la fenêtre Windows réduite.
Le renderer bureau configure donc la vue partagée avec
`trackingOptions: { scheduling: "timer" }`.

`createTrackingSession(callbacks, options?)` conserve une seule boucle et un
seul suivi d'identités. L'option `scheduling: "timer"` programme le passage
suivant avec `setTimeout` après chaque traitement, avec un délai de `1000 / 30`
ms ; le temps d'analyse s'ajoute à ce délai. Le web conserve par défaut
`requestAnimationFrame`. L'arrêt annule le callback du scheduler choisi ;
la déduplication, les expirations et le nettoyage restent communs.
Ce paragraphe décrit le fonctionnement livré à l'étape 9 ; la correction de
fluidité de l'étape 10 inclut désormais le traitement dans ce budget de 33 ms.

**Images processed** augmente uniquement après l'analyse d'une nouvelle image
et son passage dans le moteur, y compris sans main détectée. Le compteur de
commandes ne prouve pas à lui seul la continuité du suivi. L'arrêt remet les
deux compteurs à zéro et libère les ressources. La fermeture quitte réellement
l'application, sans zone de notification ni démarrage automatique.

Les tests et builds sont décrits plus bas. L'utilisateur a confirmé le bon
fonctionnement de ses essais webcam, puis le commit et le push de cette étape.
Le [guide Desktop](../apps/desktop/README.md#vérifications-manuelles) décrit
désormais les essais du contrôle du curseur ajouté à l'étape 10.

Les commandes restaient simulées à l'issue de l'étape 9.

## Étape 10 — validée et commitée dans `a2449a7`

```text
feat(desktop): execute system pointer commands
```

Après **Start camera**, le bouton **Enable Windows pointer** active le vrai
curseur sur l'écran principal Windows. Le bureau réutilise la vue du Playground,
ses événements `gesture-frame` / `tracking-stop`, le moteur et ses commandes
`pointer:move`. Les slots ajoutent uniquement l'interface bureau. La version web
conserve la simulation et n'accède pas aux entrées système.

Le preload CommonJS sandboxé expose seulement l'activation, l'arrêt, l'envoi
des commandes et l'état. Le main valide la fenêtre, la frame principale,
l'origine locale et les données. Chaque activation crée un identifiant de
session ; les paquets d'une ancienne activation sont ignorés. La fraîcheur des
images est vérifiée avec l'horodatage du moteur converti en époque, sans
comparer les horloges `performance.now()` de processus différents.

Le main transforme les coordonnées normalisées déjà mises en miroir en pixels
physiques de l'écran principal, via les dimensions Electron converties de DIP.
Un seul helper PowerShell Windows, lancé à l'activation, reçoit des données
JSON et appelle `SetPhysicalCursorPos`. Il acquitte les appels réels, refuse
les commandes expirées et ne reçoit aucun code provenant du renderer.

Le contrôleur garde un appel natif en cours et au plus une destination récente
en attente. Une absence, un repos, une ambiguïté ou une expiration efface
cette attente et annule le trajet. Une image répétée avec un pointeur principal
toujours actif ne transmet rien et ne renouvelle pas le watchdog. Après 250 ms
sans commande fraîche, le contrôle attend une nouvelle commande. Une nouvelle
commande valide reprend les déplacements.

Les premiers essais de l'utilisateur ont signalé un mouvement très saccadé,
proche de 10 positions par seconde malgré un écran à haute fréquence. La boucle
vision n'ajoute plus 33 ms après le traitement : elle attend seulement le reste
du budget, sans rattrapage. Le main interpole des positions physiques entre le
dernier point réellement acquitté et la cible, avec une durée de trajet bornée
entre 16,7 et 100 ms. Le premier point après activation ou suspension reste
immédiat, sans repartir d'une ancienne main. Aucune reconnaissance n'est ajoutée.

La présentation demande un passage toutes les `1000 / 120` ms, uniquement
pendant un trajet, mais la cadence réelle dépend de Windows. Une mesure isolée
du timer Node a montré environ 15,6 ms entre réveils : ne pas promettre 120 Hz,
ni 244 Hz, ni confondre cette cadence avec celle de la caméra. Les timers et
les positions intermédiaires en attente sont annulés lors des arrêts. Un appel
natif déjà engagé peut encore se terminer ; il ne relance aucun trajet.

**Stop Windows pointer** et **Ctrl + Alt + Esc** désactivent le contrôle en
gardant la caméra. Le raccourci est global pendant le démarrage et l'activation ;
s'il est indisponible, l'activation échoue. **Stop camera**, le rechargement,
la perte du renderer et la fermeture désactivent le contrôle et terminent le
helper. Un changement de focus ou une réduction conserve le contrôle activé.

Les essais automatisés et natifs sont décrits plus bas. L’utilisateur a validé
et commité l’étape 10 dans `a2449a7`, tout en gardant des réserves de confort.
Il a explicitement demandé d’avancer et de revenir plus tard sur la fluidité.
Ne pas relancer ce chantier au sein du lot de pause/reprise.

## Étape 11 — validée et commitée dans `66efba1`

```text
feat(control): add gesture-based pause and resume
```

L’utilisateur a choisi **1,5 seconde** de maintien pour limiter les déclenchements
accidentels. Le geste retenu est la paume ouverte, cinq doigts tendus ; le
pincement reste disponible pour le futur clic de l’étape 14.

`gesture-control.ts` dans `interactions` interprète les postures existantes du
moteur, avec `CONTROL_HOLD_MS = 1500`. Le résultat du moteur contient maintenant
`{ tracking, poses, pointers, control, commands }`. `control` expose `paused`,
`holdProgress`, `handId` et `requiresRelease`. Le maintien commence après la
confirmation de la paume (80 ms existants), ce qui ajoute cette courte
confirmation au délai choisi. Seules les nouvelles observations le font avancer.
Une absence, ambiguïté, autre candidate ou changement de main annule un maintien
incomplet. À la livraison de l’étape 11, la main principale était utilisée et,
sans principale, une seule main visible pouvait effectuer le geste. L’étape 12
réservait alors ce geste à la main explicitement sélectionnée et suivie ;
le contrôle automatique actuel remplace cette obligation.

Chaque maintien complet bascule la pause une fois. Il faut montrer une autre
posture claire (pointage/pincement confirmé ou quatre doigts nettement repliés)
avant un nouveau maintien ; une
simple disparition ne réarme pas le geste. Le pointage, les absences, les
changements d’identité et les ambiguïtés ne retirent pas une pause acquise.
Une posture incertaine, y compris sur une nouvelle identité, ne réarme pas le
geste. L’état est partagé et la caméra continue. Les pointeurs de diagnostic peuvent
rester actifs pendant une pause, mais aucune commande de déplacement ne sort.

Le panneau partagé **Gesture control** affiche état, progression et instruction
de relâchement. Le bureau transmet le booléen `PointerUpdate.paused` au main.
Le contrôleur valide les données, conserve l’état `paused` et le numéro de
session, annule cible/trajectoire/watchdog et ignore les ACK tardifs. Un appel
natif déjà engagé peut se terminer. Une reprise valide attend une nouvelle
commande ; elle ne rejoue pas de cible. Le helper et le raccourci restent actifs
pendant la pause. Les boutons d’arrêt et **Ctrl + Alt + Esc** désactivent aussi
une session en pause ; un geste ne peut pas réactiver une session arrêtée.
**Stop camera** remet le moteur à zéro et désactive le contrôle Windows.

L’utilisateur a testé et commité l’étape 11, puis demandé de passer à l’étape 12.

## Étape 12 — commitée dans `1785d6c`

Historique : le sélecteur décrit ci-dessous a depuis été retiré au profit du
contrôle automatique demandé par l’utilisateur.

```text
feat(control): select the controlling hand
```

Après avoir envisagé un geste dédié, l’utilisateur a finalement demandé de
conserver le sélecteur **Main hand**. Aucun nouveau geste n’est ajouté.

Aucune main ne commande au démarrage. Le menu exige une identité actuellement
`tracked` ; **Choose a hand…** libère le contrôle. Une absence brève `missing`
réserve le rôle tant que le tracker conserve la même identité. Après expiration
ou ambiguïté, aucune autre main ne prend le relais : choisir explicitement une
main visible. Une nouvelle identité de même latéralité n’est pas une preuve de
reconnaissance physique. Ces identités sont locales à la session.

`HandPointerFrame.selectionStatus` remplace `preferredHandId` et distingue
`unselected`, `tracked`, `missing`, `lost` et `ambiguous`. Le choix perdu reste
affiché pour expliquer le blocage. `setPrimaryHand(id)` rejette une identité
indisponible avant mutation ; `null` efface le choix sans mode automatique.
Le verrou de perte empêche aussi une ancienne identité de reprendre sans choix.

Le moteur conserve la dernière observation pour rendre immédiatement les rôles
après un choix. `setPrimaryHand` renvoie un instantané sans commande ;
`selectionChanged` signale un vrai changement. Cela ne rejoue pas l’image et ne
confirme pas de nouvelle posture. Un maintien de pause incomplet est annulé,
mais une pause acquise reste active. Seule la main sélectionnée peut basculer
la pause ; après perte, il faut d’abord choisir une main visible.

Dans le bureau, l’activation exige caméra active et sélection visible. Le bouton
d’arrêt reste disponible après perte ou pendant une pause. Le changement de
sélection envoie immédiatement une annulation sans commande, datée au moment
du choix explicite ; utiliser la dernière capture la ferait rejeter comme
doublon. Les commandes normales conservent l’heure de leur image. Le main annule
aussi le trajet si l’identité d’une commande change et ignore les ACK tardifs de
l’ancienne trajectoire. Un appel natif déjà engagé peut encore se terminer.

**Stop camera** remet la sélection à zéro et désactive le contrôle Windows.
La logique reste dans le moteur commun, sans second suivi d’identités dans le
main. Les seuils de vision et les performances restent inchangés dans ce lot.
L’utilisateur a commité cette étape et demandé la suite.

## Lot courant — ergonomie Playground et Desktop

Une calibration de l’étape 13 avait été implémentée sans commit. L’utilisateur
la juge peu utile pour son usage actuel, signale qu’après choix d’une main le
bouton Windows était indisponible et la simulation sans pointeur, puis demande
d’annuler cette modification et de revenir sur l’ergonomie avant la roadmap.
Les modifications non commitées de calibration ont été retirées.

La vue partagée regroupe les contrôles caméra, l’état de la main automatique, les états
de suivi/pointage/pause et, dans le bureau, l’activation Windows. Sur écran
large, vidéo et simulation sont côte à côte. **Tracking and gesture details**
replie les détails des postures, identités et coordonnées ; le journal des
commandes est également replié, avec son compteur visible. Le moteur et les
conditions de pause et d’activation Windows restent explicites.

La cause du blocage réel n’est pas établie. L’identité peut notamment expirer
après 120 ms sans observation, mais ne pas affirmer que cela explique cet
essai sans relever les états affichés. Un nouvel essai webcam est nécessaire.
L’utilisateur réalise `git add`, `git commit` et le push ; attendre sa
validation de ce lot avant de reprendre la roadmap.

## Contrôle automatique — lot courant

L’utilisateur a demandé de supprimer la sélection manuelle après des pertes de
suivi répétées. La main en pointage confirmé prend le contrôle ; si les deux
pointent, la main déjà active reste prioritaire. Quand elle ne pointe plus, une
autre main pointante sur une nouvelle image peut prendre le relais. Deux
pointages simultanés sans propriétaire départagent par le plus petit identifiant.
Une main seule au repos peut effectuer le geste de pause. Après perte ou ambiguïté,
une observation confirmée peut réactiver le contrôle sans menu. La paume ouverte
de la main de contrôle garde la priorité pour permettre son
maintien et pendant la pause tant qu’elle reste suivie. Les identités locales ne
prouvent pas quelle main physique revient ; une autre main pointante
peut donc prendre le contrôle. La pause reste acquise et les images répétées ne
produisent pas de commande. Le bouton Windows exige seulement la caméra active.

Le contrôle automatique et l’interface ont été commités dans `32a01a2`. Un
conflit a ensuite été reproduit : avec deux mains, le pointage de la seconde
pouvait interrompre le maintien de la paume de contrôle. La correction actuelle
garde cette priorité et rend la progression visible ; elle reste à valider avec
la webcam.

Le navigateur a vérifié le parcours automatique avec le vrai moteur et un exécuteur simulé :
deux mains, perte et retour, pause conservée et arrêt d’urgence. Ces essais ne
remplacent pas la webcam ou le curseur Windows réels. **414 tests passent** ;
attendre la validation utilisateur avant le clic par pincement.

## Plan de progression

- **1–5 — réalisé** : recadrage, suppression des expériences et nettoyage.
- **6–7 — réalisé** : interprétation commune, commandes de pointeur et simulation.
- **8 — réalisé** : socle Electron Windows réutilisant le moteur et l'interface.
- **9 — réalisé** : suivi hors premier plan, validé et livré dans `9804677`.
- **10 — réalisée** : véritable curseur Windows, accepté et commité dans `a2449a7`.
- **11 — réalisée** : pause/reprise par paume ouverte maintenue 1,5 seconde, validée dans `66efba1`.
- **12 — commitée** : sélection obligatoire dans **Main hand**, sans réattribution après perte, dans `1785d6c`.
- **Lot courant** : ergonomie et main de contrôle automatique, à valider avec la webcam.
- **13–18** : calibration reportée ; prochain objectif, clic par pincement dans une vraie application, puis défilement et réglages.
- **19–24** : clavier superposé, invocation, touches, saisie, édition et raccourcis.
- **25–27** : parcours complets, CI Windows et distribution.

Pour une même séquence d'observations horodatées et les mêmes réglages, le moteur
doit produire les mêmes commandes. Le Playground simule leurs effets et
l'exécuteur PC les transmet au système. La simulation ne prouve pas le bon
fonctionnement sur Windows : des validations réelles seront nécessaires.

## Validation et lancement

Dernière validation connue du recadrage : **139 tests conservés passent**, lint,
formatage, deux builds web, installation propre Docker et image de production
Nginx vérifiés. Chrome a aussi testé les pages aux formats bureau/mobile,
la navigation et le cycle caméra avec une caméra simulée. L'utilisateur a
ensuite validé le recadrage. Ces résultats ne prouvent aucun contrôle natif.

Validation automatisée de l'étape 6 : **146 tests passent**, dont 7 nouveaux
cas d'intégration du moteur ; lint, formatage et builds des deux interfaces
réussis. L'utilisateur a également validé ses essais manuels de cette étape.

Validation de l'étape 7 : **157 tests passent**, lint, formatage et builds des
deux interfaces réussis. Chrome a vérifié le laboratoire à 1440 et 390 px avec
des observations synthétiques : émissions, déduplication, miroir, journal borné,
repos et arrêt, sans erreur JavaScript ni débordement horizontal. Ces contrôles
ne constituent pas des essais webcam réels. L'utilisateur a ensuite testé,
revu et validé cette étape avant son commit.

Validation automatisée de l'étape 8 : **201 tests passent**, dont 44 tests
supplémentaires de politique locale et de permissions. Lint, formatage, builds
web et bureau, installation propre et build du hub dans Docker réussis.

Electron Windows a été lancé depuis WSL2 et contrôlé avec une caméra simulée :
chargement réel de MediaPipe, traitement vidéo, trois cycles caméra avec pistes
libérées à l'arrêt, refus du microphone, navigation et fenêtres externes bloquées,
confinement des fichiers, redémarrage et fermeture pendant le suivi vérifiés.
Aucune erreur JavaScript non interceptée. Les chemins de fichiers ont également
été vérifiés avec Node Windows. Ces essais ne remplacent pas la validation avec
la vraie webcam de l'utilisateur. À l'issue de l'étape 8, aucun contrôle système
ni suivi continu hors premier plan n'était validé.

Validation automatisée de l'étape 9 : **225 tests passent**, lint, formatage et
builds web/bureau réussis. Les mêmes scénarios de session sont exécutés avec les
deux cadences : arrêt, redémarrage, déduplication, expiration, perte et retour
d'une main, callbacks périmés et ressources retardées. Les tests du bootstrap
vérifient aussi le réglage initial d'arrière-plan et les protections.

Le contrôle supplémentaire `npm run check` signale huit erreurs de tri
d'importations préexistantes dans des fichiers non modifiés de `hub`, `core`
et `interactions`. Le contrôle Biome complet des sept fichiers de code modifiés
passe ; aucun nettoyage hors périmètre n'a été ajouté.

Un scénario natif Electron Windows, lancé depuis WSL2 avec une caméra simulée,
a vérifié la perte de focus, la réduction, la restauration, la pause/reprise de
la source, l'arrêt, le redémarrage puis la fermeture réelle du processus.
Pendant 30 secondes de réduction, **388 nouvelles images ont été traitées** ;
les prélèvements toutes les deux secondes confirment une progression continue
du compteur, des images décodées et des pixels vidéo. Aucune erreur JavaScript
interceptée. L'état réduit a été contrôlé avec Win32, pas avec `visibilityState`,
qui reste `visible` avec ce réglage. Cette mesure ne garantit pas une cadence.

L'utilisateur a ensuite confirmé que les essais webcam fonctionnent et que
l'étape 9 est commitée et poussée dans `9804677`.

Première validation automatisée de l'étape 10 : **310 tests passent**, lint, formatage
et builds web/bureau réussis. Les nouveaux tests couvrent le driver Windows,
le coalesçage et la fraîcheur des commandes, les identifiants d'activation,
le preload, les sources IPC, le raccourci d'arrêt et le nettoyage du bureau,
y compris les notifications pendant la destruction de la fenêtre.

Un scénario natif Electron Windows lancé depuis WSL2 avec caméra simulée et
commandes synthétiques a déplacé réellement le curseur sur l'écran principal
de 5120 × 1440 pixels. Les destinations contrôlées incluent `(1280, 504)` et
le coin `(5119, 1439)`, ainsi que des déplacements hors focus et fenêtre réduite.
La position initiale du curseur a été restaurée à la fin des essais.

Le scénario vérifie aussi l'absence de helper avant activation, le démarrage
explicite, les commandes invalides ou anciennes, l'absence de répétition après
suspension, l'arrêt global `Ctrl + Alt + Esc` fenêtre réduite, l'invalidation
de l'ancienne session, l'arrêt caméra, le redémarrage et le rechargement.
La fermeture pendant le contrôle actif termine le main et le helper ; aucune
erreur JavaScript interceptée. La capture de l'interface a été inspectée.

Ces essais prouvent l'intégration IPC et le déplacement Windows avec des
commandes synthétiques. Le déplacement par les vrais gestes, sa précision,
la perte et le retour d'une main et le confort restent à valider avec la webcam.
À ce stade historique, l’étape 10 n’était pas commitée ; elle a depuis été
acceptée dans `a2449a7`. L’étape 11 a depuis été acceptée dans `66efba1`.

Après le retour sur les saccades, **336 tests passent**, lint, formatage et builds
web/bureau réussis. Les nouveaux cas couvrent le budget de vision incluant les
callbacks, le silence sur images répétées avec le vrai moteur, les trajectoires
bornées, la cadence lors du remplacement d'une cible, les ACK retardés, l'arrêt
des timers et l'expiration avant chaque émission native.

Un benchmark du contrôleur avec le vrai exécuteur Windows compare 30 cibles
synthétiques en environ 3,4 secondes : avant correction, 30 positions distinctes
(8,8/s) ; après, 195 positions distinctes, dont 180 intermédiaires (57,4/s).
Les intervalles après correction ont une médiane de 15,6 ms et un p95 de
30,8 ms ; les timers Windows et le bornage des trajets ne garantissent pas une
cadence uniforme à 120 ou 244 Hz. Le temps d'acquittement chaud du helper avait
été mesuré séparément à 0,48 ms au p95 : il n'était pas le goulot régulier.
Les positions initiales du curseur ont été restaurées après les mesures.

Le scénario Electron Windows a ensuite revérifié les déplacements hors focus
et fenêtre réduite, le raccourci global, l'arrêt caméra, la réactivation,
le rechargement et la fermeture du main et du helper, sans erreur JavaScript
interceptée. Pendant la réduction, la caméra simulée réglée à 20 images/s a
fourni 51 traitements sur environ trois secondes ; ce relevé est distinct du
benchmark des positions du curseur. La validation du confort avec les vrais
gestes restait à réaliser lors de cette première correction.

Le retour utilisateur suivant confirme le mouvement « beaucoup plus fluide » au
premier plan, puis signale deux problèmes encore dans l’étape 10 : des coupures
par salves fenêtre réduite et des pertes de pointage devant le torse dans le
Playground comme avec Windows. Il n’avait pas encore relevé `Hand poses` lors
du blocage. Ne pas attribuer avec certitude ce dernier symptôme au fond ou aux
vêtements. Ces corrections ont depuis été acceptées, avec des réserves de
confort et une demande explicite de reporter les itérations de fluidité.

Corrections supplémentaires implémentées :

- `disable-renderer-backgrounding` avant `ready` conserve la priorité Chromium,
  mais l’essai seul n’a pas suffi. Le nouveau module main-only
  `windows-tracking-performance.ts` lance un programme PowerShell statique
  ponctuel pour désactiver l’économie d’exécution du seul PID renderer fourni
  par Electron, via `Get/Set/GetProcessInformation`. Les autres bits et la classe
  de priorité CPU sont préservés. La fenêtre s’affiche après préparation ; la
  fermeture l’annule, un nouveau PID est préparé au rechargement et une erreur
  tardive de l’ancien PID est ignorée. La politique dure jusqu’à la sortie du
  renderer ; le helper ponctuel quitte aussitôt. Aucun réglage Windows global.
- `currentTime` avance parfois sans nouvelle image live : la session utilise
  `getVideoPlaybackQuality().totalVideoFrames` après une première valeur positive.
  Tant que le compteur est absent ou toujours nul, le repli horloge conserve les
  flux Firefox. Après activation du compteur, son gel ne réactive pas le repli.
  La pause vidéo et l’expiration des identités restent effectives.
- Le pincement utilisait seulement les distances projetées XY, bien que les
  angles des doigts utilisent déjà XYZ. Une rotation synthétique à 85° gardait
  la même main et les mêmes doigts, mais faisait tomber le ratio projeté à 0,189,
  provoquant `Pinch` et l’arrêt du pointeur. Détecteur et posture partagent
  maintenant le ratio distance pouce/index sur taille de paume en XYZ, corrigé
  du format vidéo ; mêmes seuils et mêmes durées. Le ratio reste 1,445 dans cette
  rotation et les commandes continuent. La profondeur reste estimée et un doigt
  `uncertain` peut encore couper le pointage malgré un squelette 2D plausible.

Les mesures Windows distinguent maintenant intervalles de traitement et simple
compteur total. Dans un relevé avant politique Windows : 20 retards de plus de
120 ms sur 30 secondes de réduction, alors que la caméra continuait à 20 images/s.
Un test A/B dans la même instance a retrouvé le temps de calcul foreground après
la seule politique HighQoS du renderer, sans changer la classe de priorité.
Après intégration, la mesure de 30 secondes traite environ 594 images, p95 entre
traitements environ 87 ms, deux retards au-dessus de 120 ms et un maximum
approchant 175 ms. Aucune longue tâche supérieure à 50 ms pendant ce dernier
intervalle ; ne pas promettre une cadence parfaite ni confondre timers et caméra.

**390 tests passent**, lint, formatage et builds web/bureau réussis. Les tests
ajoutent rotations/profondeur réelles du moteur, compteur vidéo et repli Firefox,
configuration native bornée, démarrage, rechargement concurrent et annulation.
Le contrôle Biome complet des 29 fichiers de code concernés passe. Le `check`
global conserve sept erreurs de tri d’importations préexistantes dans les
fichiers non modifiés du hub et les index core/interactions. Le fichier pinch,
maintenant modifié pour la correction XYZ, est également remis en ordre.
Le scénario Electron final a revérifié une destination réelle au coin de
l’écran et une autre fenêtre réduite, le raccourci global, l’arrêt caméra, le
redémarrage, le rechargement et la fermeture du main et du helper, sans erreur
JavaScript. Le curseur a été remis à sa position initiale. Quatre observations
physiques ont été perturbées par d’autres entrées, détectées avec
`GetLastInputInfo` : première destination, destination hors focus, immobilité sur
absence et immobilité après désactivation. Elles sont déclarées non concluantes,
pas validées. Les états d’arrêt et les sorties des processus restent contrôlés ;
l’immobilité réelle après perte/arrêt doit être retestée avec la webcam.
Ces observations décrivent la validation technique de l’étape 10 avant son
acceptation par l’utilisateur. Aucun commit/push n’est exécuté par l’agent.

Validation de l’étape 11 : **421 tests passent** (31 cas supplémentaires), lint,
formatage et builds web/bureau réussis. Les cas ajoutés couvrent maintien de
1 500 ms à plusieurs cadences, relâchement, bruit de pose, perte/ambiguïté,
main éligible, pointeurs actifs mais commandes bloquées, pause native persistante,
trajets annulés et intégration du vrai moteur vers simulation et contrôleur.
Le contrôle `check` global conserve six tris d’importations préexistants hors
fichiers modifiés (cinq fichiers hub et `core/src/index.ts`). L’index interactions,
modifié pour exporter le nouvel état, est désormais organisé.

Le navigateur a testé le vrai moteur avec observations synthétiques : maintien
court annulé, progression affichée, pause, pointage bloqué, perte sans reprise,
reprise avec une seule nouvelle main puis mouvement frais, arrêt et reset.
Captures 1440/390 px inspectées, aucun débordement ni erreur JavaScript.
Electron Windows a vérifié via son vrai pont IPC et son exécuteur la pause
fenêtre réduite, session conservée, rejet des reprises anciennes/étrangères,
reprise volontaire, raccourci global pendant la pause, rechargement et fermeture
avec arrêt des processus. Curseur restauré après l’essai. Un premier passage
natif avait atteint `error` après réduction sans détail capturé ; la relance
avec relevé de l’état passe sans reproduire cette erreur. Ne pas prétendre avoir
corrigé ce cas non identifié ni modifier les timeouts pour le masquer.
Ces essais étaient synthétiques ; l’utilisateur a ensuite validé le geste et
commité l’étape 11 dans `66efba1`.

Validation de l’étape 12 : **431 tests passent**, lint, formatage et builds
web/bureau réussis. Les régressions couvrent choix obligatoire, perte brève,
expiration, ambiguïté, absence de transfert par latéralité, sélection invalide
sans mutation, choix immédiat sans replay, pause conservée et annulation native
entre deux images. Le contrôle Biome complet des fichiers de code modifiés passe ;
le `check` global conserve les six tris d’importations préexistants hors périmètre.

Le navigateur a testé le vrai moteur avec des observations synthétiques : deux
mains sans choix, sélection, perte, retour sous une nouvelle identité de même
latéralité, ambiguïté et reset. Le wrapper Desktop a aussi été relié au vrai
contrôleur avec un exécuteur simulé : bouton conditionné à la sélection, annulation
entre images, arrêt disponible après perte et pause conservée lors d’un choix.
Captures 1440/390 px inspectées, aucun débordement ni erreur JavaScript.

Electron Windows a vérifié séparément les paquets via le vrai pont IPC et le
helper : annulation, rejet d’anciennes captures, autre identité de commande,
pause fenêtre réduite, arrêt global, rechargement et fermeture des processus.
Le curseur a été restauré. L’utilisateur a ensuite commité l’étape 12 dans
`1785d6c`. Il a signalé plus tard un blocage dont la cause reste à identifier.

Validation du lot d’ergonomie : **431 tests passent**, lint, formatage et builds
web/bureau réussis. Un navigateur a testé le Desktop simulé avec observations
synthétiques : commandes, caméra et simulation visibles en 1280 × 720 et
1440 × 900, sans débordement horizontal sur mobile ; expiration de la main après
120 ms, perte et nouvelle sélection reproduites ; aucune exception JavaScript.
Ces essais n’utilisent ni la vraie webcam ni le vrai curseur Windows.

```bash
npm test
npm run lint
npm run format:check
npm run build
npm run build:desktop
```

```bash
npm run dev
# Accueil : http://localhost:3000
# Laboratoire : http://localhost:3000/playground

npm run dev -w playground
# Laboratoire autonome : http://localhost:3002

npm run dev:desktop
# Depuis WSL2 : compilation puis fenêtre Electron Windows
```

Docker conserve les services `hub` et `playground`. Ils ont été reconstruits et
redémarrés lors du recadrage ; le conteneur abandonné a été retiré. Vérifier leur
état actuel si nécessaire, sans supposer qu'ils tournent encore.

Dans le laboratoire, pointer avec l’index choisit automatiquement la main de
contrôle. Deux mains restent possibles : si elles pointent en même temps, la main
active garde le rôle ; si elle ne pointe plus, une autre main pointante peut
prendre le relais. Après disparition, le pointage peut reprendre sans menu.

Pour valider le lot courant :

1. Démarrer la caméra, activer le contrôle Windows et pointer : simulation et
   curseur suivent sans choisir de main. But : vérifier le parcours sans menu.
2. Présenter deux mains puis pointer avec les deux : la main active garde le
   contrôle. Retirer la première et laisser l’autre pointer : le contrôle passe
   à l’autre. But : vérifier les deux mains et le transfert.
3. Retirer la main, la ramener puis repointer : reprise automatique, sans souris.
   But : vérifier une nouvelle identité après perte.
4. Mettre en pause, perdre puis retrouver la main : la pause reste active. But :
   vérifier que la reprise automatique ne contourne pas la pause volontaire.
   Tester aussi la paume de la main de contrôle avec l’autre main en pointage.

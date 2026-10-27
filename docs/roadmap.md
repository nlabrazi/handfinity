# Roadmap Handfinity

Objectif prioritaire : remplacer progressivement la souris et le clavier sur
PC. Windows 11 x64 est la première cible retenue, avec Electron et un
développement sous WSL2. Le code reste commun pour une future version Linux,
avec des adaptations système distinctes. Le contrôle d'Android par les gestes
vus par sa caméra frontale et les lunettes AR seront étudiés après cette phase.

Les numéros ci-dessous désignent les étapes du plan. Pour la suite, chaque étape
doit être livrée en petits commits cohérents : une fonctionnalité par commit,
voire plusieurs commits si elle est trop importante. Aucune autorisation de
travailler en autonomie ne permet de fusionner plusieurs étapes en un gros lot.

L'utilisateur valide les changements et réalise lui-même `git add` et
`git commit`. Livrer un lot à la fois, puis attendre sa validation. Si plusieurs
lots sont explicitement demandés ensemble, conserver des changements séparément
revus et applicables. Les tests adaptés et une courte liste « quoi tester,
comment et pourquoi » accompagnent chaque livraison.

Le template du README doit être conservé : badges, illustration, hiérarchie,
ordre des sections, séparateurs et tableaux. Mettre à jour son contenu sans
le réorganiser. Les gestes exacts et le fonctionnement réel du bureau restent
à éprouver au fil des étapes.

## Historique récent réellement livré

Les intitulés de certains commits commencent par `docs` alors qu'ils contiennent
également du code. Le périmètre ci-dessous est fondé sur leur contenu Git.

| Commit | Périmètre livré | État après recadrage |
| --- | --- | --- |
| `ae6ac83` | Modèle d'observation partagé | Conservé |
| `42edba7` | Suivi de deux identités | Conservé |
| `29838c8` | Sessions caméra et suivi communes | Session commune conservée ; adaptateur dédié retiré |
| `b26772d` | Reconnaissance des postures | Conservée |
| `f493bca` | Pointeurs et détection des cibles | Pointeurs conservés ; contrôleurs de cibles retirés |
| `cb5f96f` | Sélection et annulation dans les démonstrations | Retirées du projet actif |
| `35413b6` | Saisie et déplacement des tuiles | Retirés du projet actif |
| `7f6d27b` | Ensemble du recadrage et des suppressions, étapes 1 à 5 | Réalisé dans un seul commit |
| `352f8e4` | Moteur commun des postures et pointeurs, étape 6 | Testé et validé par l'utilisateur |
| `d18d337` | Commandes de déplacement partagées et simulation, étape 7 | Testé, revu et validé par l'utilisateur |
| `9c0de98` | Socle Electron Windows et lancement depuis WSL2, étape 8 | Accepté et commité par l'utilisateur |
| `9804677` | Suivi bureau en arrière-plan et cadence par timer, étape 9 | Testé avec la vraie webcam, validé, commité et poussé par l'utilisateur |
| `a2449a7` | Véritable curseur Windows, corrections de fluidité, suivi réduit et posture, étape 10 | Validé et commité par l’utilisateur ; améliorations de confort reportées |
| `66efba1` | Pause et reprise gestuelles par paume ouverte maintenue 1,5 seconde, étape 11 | Testée, validée et commitée par l’utilisateur |
| `1785d6c` | Sélection explicite de la main, étape 12 | Commitée par l’utilisateur, qui a demandé d’avancer ; push non confirmé |

## Recadrage et suppressions — réalisé

**Les cinq périmètres suivants ont été regroupés dans `7f6d27b`. Les titres
indiquent le découpage qui était prévu ; ils ne sont pas cinq commits existants.**

1. **`docs(project): recenter Handfinity on desktop input control`** — Objectif,
   responsabilités, capacités actuelles et nouvelle roadmap documentés.
2. **`refactor(hub): simplify the homepage around Handfinity`** — Accueil et
   identité visuelle conservés ; catalogue de projets et routes abandonnées retirés.
3. **`refactor(apps): remove Paint and its dedicated tracking adapter`** — Application,
   adaptateurs dédiés, exports et dépendances sans consommateur supprimés.
4. **`refactor(playground): replace target demos with hand diagnostics`** — Exercices de
   cartes et de tuiles remplacés par les diagnostics vidéo, postures et pointeurs.
   Journal mono-main et fichiers de démarrage inutilisés retirés.
5. **`chore(infra): align tooling with the remaining applications`** — Installation,
   commandes, Docker et CI alignés sur les deux interfaces conservées.

L'historique Git conserve les étapes précédentes. Les anciennes expériences
ne font plus partie de la roadmap active. La correction du template du README
et la préparation de la passation sont des changements documentaires distincts
du travail fonctionnel repris à l'étape 6.

## Moteur commun et premier contrôle PC — à réaliser

6. **`refactor(engine): centralize the gesture processing pipeline`** — Centraliser
   l'interprétation et faire consommer cette chaîne commune par le Playground.
   Livrée et validée dans `352f8e4` : `createGestureEngine` dans `interactions`
   assemble postures et pointeurs, transmet le choix principal et regroupe les
   remises à zéro. La session de vision conserve l'unique suivi d'identités.
7. **`feat(input): expose shared pointer commands`** — Produire les commandes de
   déplacement ; les journaliser et les exécuter en simulation dans le Playground.
   Livrée et validée dans `d18d337` : `pointer:move` pour la main principale
   en pointage, destinations normalisées avec miroir commun, journal borné et
   curseur simulé. Aucun contrôle système n'est ajouté.
8. **`chore(desktop): bootstrap the Windows application`** — Ajouter l'application
   bureau et documenter son choix technique, sans recopier la logique du moteur.
   Livrée et acceptée dans `9c0de98` : Electron 45.0.0, fenêtre locale réutilisant
   `playground/view`, permissions caméra vidéo et lancement Windows depuis WSL2.
   L'interface reste celle des diagnostics et de la simulation ; le suivi hors
   premier plan et l'exécution système ne sont pas inclus.
9. **`feat(desktop): keep hand tracking active in the background`** — Vérifier la
   caméra et le moteur quand l'utilisateur change d'application ou réduit la fenêtre.
   Livrée dans `9804677`, validée avec la vraie webcam puis commitée et poussée
   par l'utilisateur : cadence par timer dans la session partagée pour le bureau,
   throttling Electron désactivé et compteur d'images traitées. Le web conserve
   sa cadence par défaut. Cette étape prépare l'exécution Windows de l'étape 10.
10. **`feat(desktop): execute system pointer commands`** — Déplacer le vrai curseur,
    avec activation explicite, arrêt et suspension sur perte de suivi.
    Livrée, validée et commitée par l’utilisateur dans `a2449a7` :
    **Enable Windows pointer** après **Start camera**, écran principal entier,
    miroir unique, pont IPC limité et exécuteur PowerShell persistant.
    **Stop Windows pointer**, **Ctrl + Alt + Esc**, l'arrêt caméra et la fermeture
    désactivent le contrôle. Le repos ou la perte de suivi suspend les commandes.
    **390 tests passent**, lint, formatage et builds web/bureau réussis ; les
    essais natifs avec commandes synthétiques confirment le déplacement et les
    arrêts, y compris hors focus et fenêtre réduite. Clics, défilement et clavier restent ultérieurs.
    Les premiers essais ont demandé une correction de fluidité : budget caméra
    incluant le traitement, absence de faux arrêt entre images et interpolation
    des positions. Une comparaison native avec les mêmes cibles passe d'environ
    9 à 57 positions distinctes par seconde ; l’utilisateur a confirmé cette
    amélioration au premier plan. Les coupures fenêtre réduite ont ensuite demandé
    une politique de performance Windows pour le renderer et une déduplication
    vidéo compatible avec Firefox. Les pertes près du torse ont révélé un faux
    pincement lié à la projection 2D ; sa mesure utilise maintenant XYZ. Ces
    corrections ont été acceptées ; l’utilisateur juge le résultat meilleur,
    encore perfectible, et demande de reporter les itérations de fluidité.

L’utilisateur a demandé d’annuler les modifications non commitées de calibration
de l’étape 13, qu’il juge peu utiles pour son usage actuel, et de prioriser
l’ergonomie du Playground et du bureau. La calibration reste reportée ; attendre
la validation de cette interface et un nouvel essai webcam avant la suite.

Décisions de l'étape 8 : Windows 11 x64 et Electron, avec édition et compilation
sous WSL2 puis exécution directe sous Windows. Les essais web de l'utilisateur
restent possibles dans Firefox Windows. Le suivi hors premier plan a été validé
à l’étape 9 ; le parcours de l’étape 10 a ensuite été accepté dans `a2449a7`. La calibration de la zone des mains est prévue à l'étape 13.

## Souris utilisable — à réaliser

11. **`feat(control): add gesture-based pause and resume`** — Pause et reprise
    volontaires avec états communs dans la simulation et sur PC. Livrée et
    validée dans `66efba1` : maintien de la paume ouverte confirmée pendant **1,5 seconde**,
    délai choisi par l’utilisateur. Un seul basculement jusqu’au relâchement
    clair des doigts ou à un pointage confirmé ; ni le pointage ni la perte de suivi ne retirent une pause.
    Main principale seulement, ou main unique si aucune principale n’existe.
    État et progression visibles ; arrêt des commandes commun et état `paused`
    transmis au main Windows. **421 tests passent**, lint, formatage et builds
    web/bureau réussis. L’étape 12 remplace ensuite le choix automatique par une
    sélection obligatoire ; une main non choisie ne peut plus agir sur la pause.
12. **`feat(control): select the controlling hand`** — Choix explicite et prévention
    Historique : le sélecteur a depuis été remplacé par le contrôle automatique.
    du transfert involontaire du contrôle. Commitée dans `1785d6c` : l’utilisateur
    conserve **Main hand**, sans nouveau geste. Choix obligatoire d’une identité
    visible, aucun relais automatique après expiration ou ambiguïté, états de
    sélection affichés et conservation de la pause lors d’un changement.
    Le changement annule l’ancienne trajectoire sans rejouer d’image, puis attend
    une observation fraîche de la nouvelle main. **431 tests passent**, lint,
    formatage et builds web/bureau réussis. Un blocage a été signalé ensuite :
    sa cause reste à déterminer avec la webcam et l’interface réorganisée.
    Le nouveau contrôle automatique est implémenté et attend l’essai webcam ;
    ensuite, prioriser le clic par pincement des étapes 14 et 15.
13. **`feat(pointer): calibrate the hand control area`** — Correspondance avec l'écran,
    précision, accès aux bords et amplitude de mouvement. Modifications non
    commitées annulées à la demande de l’utilisateur ; étape reportée.
14. **`feat(input): translate pinch into primary-button commands`** — Appui et
    relâchement testés et observables dans le Playground.
15. **`feat(desktop): execute primary-button commands`** — Clic et déplacement avec
    maintien sur le PC, avec relâchement sur interruption ou perte de communication.
16. **`feat(mouse): add secondary-click control`** — Clic secondaire et absence
    de conflit avec les autres commandes.
17. **`feat(mouse): add controlled system scrolling`** — Reconnaissance, simulation,
    exécution et arrêt fiable du défilement.
18. **`feat(settings): persist pointer configuration`** — Conservation et
    réinitialisation des réglages utiles.

L'appui et le relâchement constituent un même cycle. Les tests réels devront
couvrir le clic, le déplacement avec maintien et les clics successifs. Toute
commande maintenue doit se terminer lors de la perte du contrôle.

## Clavier à la demande — à réaliser

19. **`feat(keyboard): display a floating keyboard`** — Ouverture manuelle d'un
    clavier superposé en préservant la destination de saisie.
20. **`feat(control): switch between pointer and keyboard modes`** — Invocation
    gestuelle volontaire et prévention des commandes souris involontaires.
21. **`feat(keyboard): select virtual keys through the shared engine`** — Sélection,
    retours visuels et événements vérifiables dans le Playground.
22. **`feat(desktop): send virtual keyboard text to the target application`** — Envoi
    des caractères au champ destinataire et vérification du focus.
23. **`feat(keyboard): add editing and navigation keys`** — Espace, Retour arrière,
    Entrée, Tabulation et flèches, distincts des caractères.
24. **`feat(keyboard): add modifiers and shortcuts`** — Majuscule, Ctrl, Alt et
    combinaisons, avec relâchement sur interruption et changement de mode.

Les besoins d'interaction avec les touches seront traités lors de cette phase,
sans conserver des contrôleurs sans consommateur dans l'attente de leur usage.

## Validation et distribution — à réaliser

25. **`test(desktop): cover complete mouse and keyboard workflows`** — Parcours
    reproductibles entre navigateur, éditeur et Explorateur, avec interruptions.
26. **`ci(desktop): add Windows build checks`** — Vérification du build Windows en
    complément des contrôles du moteur et du web ; environnement CI à prévoir.
27. **`build(desktop): package the Windows application`** — Distribution lançable
    hors développement, installation, démarrage, arrêt et limites documentés.

Les tests du point 25 complètent ceux de chaque fonctionnalité. Les essais sur
le système cible restent nécessaires pour l'exécution des entrées, le focus,
les permissions, la précision et le confort d'utilisation.

La [passation](passation.md) regroupe les consignes, l'état du dépôt et le
lot d’ergonomie en cours pour reprendre dans une nouvelle discussion.

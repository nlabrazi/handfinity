# Roadmap Handfinity

Objectif prioritaire : remplacer progressivement la souris et le clavier sur
PC. Windows est la première cible proposée, à confirmer avec l'environnement
de validation. Le smartphone et les lunettes AR seront étudiés après cette phase.

Chaque étape représente un commit cohérent, ou plusieurs si les essais imposent
un découpage plus fin. Les tests adaptés et les consignes de vérification font
partie de chaque changement. Les gestes exacts et la technologie bureau restent
à éprouver avant leur adoption.

## Recadrage et suppressions — réalisé

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
ne font plus partie de la roadmap active.

## Moteur commun et premier contrôle PC — à réaliser

6. **`refactor(engine): centralize the gesture processing pipeline`** — Centraliser
   l'interprétation et faire consommer cette chaîne commune par le Playground.
7. **`feat(input): expose shared pointer commands`** — Produire les commandes de
   déplacement ; les journaliser et les exécuter en simulation dans le Playground.
8. **`chore(desktop): bootstrap the Windows application`** — Ajouter l'application
   bureau et documenter son choix technique, sans recopier la logique du moteur.
9. **`feat(desktop): keep hand tracking active in the background`** — Vérifier la
   caméra et le moteur quand l'utilisateur change d'application ou réduit la fenêtre.
10. **`feat(desktop): execute system pointer commands`** — Déplacer le vrai curseur,
    avec activation explicite, arrêt et suspension sur perte de suivi.

Avant l'étape 8 : confirmer le système PC, la machine de test et la technologie
bureau. Le prototype devra vérifier la réutilisation du socle et son exécution
hors du premier plan. Le premier contrôle réel est validé dans une autre application.

## Souris utilisable — à réaliser

11. **`feat(control): add gesture-based pause and resume`** — Pause et reprise
    volontaires avec états communs dans la simulation et sur PC.
12. **`feat(control): select the controlling hand`** — Choix explicite et prévention
    du transfert involontaire du contrôle.
13. **`feat(pointer): calibrate the hand control area`** — Correspondance avec l'écran,
    précision, accès aux bords et amplitude de mouvement.
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

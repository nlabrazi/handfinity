# Handfinity — Accueil immersif

Le hub est le point d'entrée commun. Depuis la racine du monorepo :

```bash
npm run dev
```

| Adresse locale | Écran |
| --- | --- |
| `http://localhost:3000/` | Accueil et choix d'une expérience |
| `http://localhost:3000/paint` | Atelier Paint |
| `http://localhost:3000/playground` | Laboratoire et zone de navigation expérimentale |

Les cartes de l'accueil s'ouvrent au clic, au toucher ou avec Entrée au clavier.
Les emplacements « À venir » ne sont pas interactifs. Le pointage gestuel reste
dans Playground ; la validation et le défilement gestuels ne sont pas encore
branchés sur l'accueil.

## Ambiance

La direction visuelle reprend `public/screenshot.png` : fond bleu nuit, lumières
cyan et violettes, panneaux translucides et touches rose-orangé pour Paint.
La scène combine une main holographique en SVG, des anneaux, une grille en
perspective, des courbes lumineuses et des aperçus animés des projets. Le pointeur de la souris déplace
légèrement la projection et la lumière. Les cibles restent fixes.

Le bouton **Pause de l'ambiance** suspend les animations et la parallaxe ; le
réglage est conservé localement quand le navigateur autorise le stockage.
La préférence système `prefers-reduced-motion` est prioritaire. L'accueil
ne demande pas la webcam et ne charge pas le moteur de vision.

## Navigation et cycle de vie

Le socle d'animation utilise GSAP dans le workspace `hub` :
`useGsapContext` crée un contexte limité à la vue après son montage et le
nettoie au démontage. Les animations créées dans son callback sont supprimées
et leurs styles initiaux restaurés. Les gestionnaires d'événements qui créent
des animations ensuite doivent être enregistrés avec `context.add`.
`useMotionPreferences` partage la pause et la préférence système depuis
l'application hôte ; il évite de multiplier les écouteurs `matchMedia`.

| Fichier dans `src/` | Responsabilité |
| --- | --- |
| `animations/homeAmbience.ts` | Timeline des lumières, particules, main, scans, anneaux et tracés Paint. |
| `composables/useHomeAnimations.ts` | Pause/reprise de la timeline et parallaxe avec des tweens `quickTo` réutilisés. |
| `composables/usePageTransition.ts` | Entrée/sortie des pages, annulation et restauration des styles pour `KeepAlive`. |
| `composables/useGsapContext.ts` | Création et nettoyage du contexte GSAP propre à une vue. |
| `composables/useMotionPreferences.ts` | Préférence système et choix de pause persisté, partagés par injection Vue. |

Les anciens `@keyframes` de l'accueil ont été retirés. CSS conserve la palette,
la disposition responsive et les courtes transitions de couleur/bordure au
survol ; GSAP pilote les mouvements de la scène et les transitions des pages.
Une pause fige l'ambiance et recentre la parallaxe. La réduction des mouvements
neutralise aussi les transitions de navigation. Celles-ci attendent la fin du
patch Vue avant de poursuivre, pour rester compatibles avec `KeepAlive`.
Chaque sortie de l'accueil détruit ses animations et restaure les styles SVG/DOM.

- Vue Router fournit les routes, les titres et l'historique du navigateur.
  Les vues sont chargées à la demande depuis les exports `paint/view` et
  `playground/view` des workspaces existants.
- `KeepAlive` conserve uniquement Paint : dessin, historique et pinceau restent
  en mémoire lors des déplacements dans le hub. Un rechargement de l'onglet
  efface cet état ; **Export PNG** permet d'enregistrer le dessin.
- Quitter Paint termine le trait et arrête sa session caméra. Un démarrage
  encore en attente est invalidé : la session est fermée dès son initialisation
  terminée. Revenir dans Paint ne redémarre pas la webcam automatiquement.
- Playground est démonté lorsqu'on le quitte et ferme ses ressources.
- Le focus rejoint le titre après navigation. Une adresse inconnue affiche
  une page proposant de revenir à l'accueil.

Les applications restent utilisables séparément : `npm run dev -w paint` sur
le port **3001**, `npm run dev -w playground` sur le port **3002**.

## Build et hébergement

```bash
npm run build -w hub
```

Le build `apps/hub/dist/` contient les trois écrans. Il n'est pas nécessaire de
servir les builds autonomes de Paint et Playground à côté du hub.

Le serveur doit renvoyer `index.html` pour les routes de l'application afin que
les liens directs et les rechargements de `/paint` et `/playground` fonctionnent.
Le `nginx.conf` à la racine contient ce fallback. Le Dockerfile cible le hub
par défaut ; `--build-arg APP=paint` ou `APP=playground` conserve la possibilité
de construire une application autonome.

## Vérifications

```bash
npm test
npm run lint
npm run format:check
npm run build
```

Les six tests du hub couvrent les transitions interrompues, la pause en cours
de navigation, les callbacks différés et le nettoyage des tweens. Ils sont
exécutés avec les autres suites par `npm test` et la CI.

Pour tester dans le navigateur : ouvrir chaque carte, revenir à l'accueil,
utiliser Précédent/Suivant, puis recharger chaque URL. Dessiner dans Paint,
changer de page et revenir : vérifier le dessin, Undo/Redo et la caméra arrêtée.
Essayer aussi de quitter pendant le démarrage caméra. Vérifier les liens au
clavier, la pause des animations, la réduction des mouvements et un écran étroit.

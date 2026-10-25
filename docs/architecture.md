# Cadrage et responsabilités

## Objectif

Handfinity vise le remplacement progressif de la souris et du clavier sur PC,
dans les logiciels existants, y compris le navigateur. L'utilisation ne doit
pas nécessiter une intégration dans chaque site web. Le smartphone et les
lunettes AR sont des perspectives ultérieures, avec leur propre étude de
faisabilité et leur propre intégration système.

Windows est la première cible PC proposée. Le système effectivement supporté,
la machine de validation et la technologie bureau doivent être confirmés avant
le développement de l'application locale.

## Existant conservé

| Responsabilité | Emplacement | Consommateur actuel |
| --- | --- | --- |
| Observation et coordonnées | `packages/core/src/hand-observation.ts` | Vision, suivi et postures |
| Association des identités | `packages/core/src/tracking/` | Session de suivi |
| Mesure des doigts et stabilisation des postures | `packages/core/src/poses/` | Moteur commun |
| Détection du pincement | `packages/core/src/gestures/` | Reconnaissance des postures |
| Lissage des points | `packages/core/src/pointer/` | Suivi des pointeurs |
| Caméra, MediaPipe et cycle de vie | `packages/vision/src/` | Playground |
| Pointeurs et main principale | `packages/interactions/src/` | Diagnostics du Playground |
| Orchestration postures → pointeurs | `packages/interactions/src/gesture-engine.ts` | Playground |
| Commandes de déplacement | `packages/interactions/src/pointer-commands.ts` et moteur commun | Simulation du Playground |
| Exécution simulée et journal | `apps/playground/src/pointer-simulation.ts` | Diagnostics des commandes |
| Présentation et navigation | `apps/hub/` | Accueil et route du laboratoire |
| Rendu et diagnostics | `apps/playground/` | Essais de reconnaissance |

Le détecteur de pincement reste une brique interne à la reconnaissance des
postures. L'API publique de vision expose la session de suivi et les connexions
nécessaires au rendu ; les types d'observation sont définis dans `core`.

Les anciennes applications et expériences retirées restent accessibles dans
l'historique Git. Le dépôt actif ne conserve pas de dossier d'archives ni de
contrôleur sans consommateur pour un éventuel usage futur.

## Contrats actuellement implémentés

- `HandObservation` : 21 repères normalisés de l'image source, latéralité,
  confiance de cette latéralité et horodatage monotone en millisecondes.
  Le score gauche/droite n'est pas une confiance globale de détection.
- `createHandIdentityTracker` : au plus deux identités locales à la session,
  tolérance d'absence de 120 ms et abandon des associations ambiguës.
- `createHandPoseTracker` : `pointing`, `open-palm`, `pinch` et `unknown` par
  identité, avec posture candidate et mesures de diagnostic. Le pointage et
  l'ouverture des cinq doigts demandent 80 ms de stabilité ; le pincement
  conserve ses confirmations de 40 ms à la fermeture et 60 ms au relâchement.
- `createHandPointerTracker` : position de l'index, état actif en pointage,
  lissage par identité et choix automatique ou manuel de la main principale.
- `createGestureEngine` : enchaînement postures → pointeurs à partir du suivi
  fourni, commandes de déplacement, choix principal et remise à zéro communs,
  sans Vue ni caméra.
- `PointerMoveCommand` : `type: "pointer:move"`, identité `handId`, horodatage
  d'observation `timestamp` et destination normalisée `position: { x, y }`.
  L'origine est en haut à gauche, avec le miroir horizontal déjà appliqué par
  le moteur ; les diagnostics des pointeurs restent dans le repère source.
- `createTrackingSession` : démarrage, arrêt, libération des ressources et
  traitement des nouvelles images, avec expiration des identités même sans
  nouvelle image tant que la boucle s'exécute.

Les coordonnées des observations et des pointeurs précèdent le miroir d'affichage. La profondeur relative au
poignet n'est pas une distance métrique. L'ordre des observations et la
latéralité ne constituent pas des identifiants physiques persistants.

## Architecture à construire

```text
Acquisition et observations
          ↓
Interprétation commune : suivi, postures, pointeur, états de contrôle
          ↓
Commandes indépendantes de l'interface
          ├── Exécuteur de simulation → Playground
          └── Exécuteur système       → Application PC
```

La session de vision possède l'unique suivi des identités. Le moteur commun
`createGestureEngine` dans `@handfinity/interactions` reçoit ce suivi via
`update(trackingFrame, aspectRatio)` et retourne `{ tracking, poses, pointers, commands }`.
Il orchestre les trackers existants dans cet ordre, transmet le choix principal
via `setPrimaryHand(id)` et regroupe leur remise à zéro dans `reset()`.
Il dépend de `core`, sans dépendre de `vision`, de Vue ou du DOM.

Le Playground consomme chaque résultat de la session, y compris sans nouvelle
image pour traiter les expirations. Les trackers dédupliquent les observations
avec leur horodatage ; le moteur n'ajoute aucune confirmation ni aucun lissage
sur une image répétée. Vue conserve le rendu et les diagnostics et réinitialise
le moteur à l'arrêt. Les commandes de déplacement sont émises uniquement pour
une nouvelle observation de la main principale en pointage confirmé, une fois
par image. Une image répétée ou un diagnostic conservé jusqu'à l'expiration
ne produit aucun déplacement.

La destination de `pointer:move` utilise la position déjà lissée :
`x = 1 - pointer.position.x`, `y = pointer.position.y`, entre 0 et 1.
`createPointerSimulation` consomme ces commandes sans réinterprétation ni
second miroir. Il conserve la dernière position sans commande, borne son
journal à huit entrées, compte les commandes reçues et efface ces états à
l'arrêt. Les états de contrôle et l'exécuteur système restent à construire.

Les règles d'interprétation doivent être partagées : seuils, confirmations,
choix de main, activation, pause, gestes et transitions. Une interface ne doit
pas ajouter sa propre détection du pincement ou une autre interprétation du
même geste. Les commandes seront introduites au rythme de leurs consommateurs
réels : déplacement, boutons, défilement puis clavier.

La simulation affiche les commandes de déplacement et leurs effets. Le futur
exécuteur système les traduira en entrées du PC. Le choix d'un champ de texte ou d'un bouton du
logiciel utilisé appartiendra au fonctionnement normal de ce logiciel.

Les tests utilisent des observations horodatées et des réglages identiques
pour vérifier la production des commandes. La simulation ne remplace pas la
validation de leur exécution réelle sur le système cible.

## Points à décider ou à éprouver

1. Environnement de validation du premier système PC et choix de l'application
   bureau. La réutilisation de TypeScript et de la vision sera vérifiée par un
   prototype avant de fixer les choix définitifs.
2. Suivi continu quand l'utilisateur change d'application ou réduit la fenêtre.
   La session actuelle dépend d'une vidéo HTML et de `requestAnimationFrame` ;
   son adaptation doit être testée dans l'environnement bureau retenu.
3. Correspondance entre la zone de mouvement des mains et l'écran, miroir,
   sensibilité et calibration.
4. Gestes volontaires d'activation, de pause, de clic secondaire, de défilement
   et d'invocation du clavier. Les postures reconnues ne fixent pas à elles
   seules leur signification dans le futur contrôle du PC.
5. Relâchement des entrées maintenues lors d'une perte de suivi, d'une erreur,
   d'un arrêt ou d'une rupture de communication avec l'exécuteur.
6. Clavier superposé et conservation de la destination de saisie pendant son
   utilisation. Une sélection de touche doit produire un seul événement.

## Limites de la première phase

L'accueil ne démarre pas la webcam. Le Playground affiche les diagnostics et
simule les déplacements dans le navigateur, puis ferme la caméra à sa sortie.
Il ne contrôle aucune autre application. Les commandes de boutons, de
défilement et de clavier ne sont pas encore implémentées.

Aucune application PC, intégration mobile, interface AR ou bibliothèque
publiée n'est présente. Le choix de l'environnement bureau ne sera pas déduit
seulement de la réussite des tests unitaires ou du build web.

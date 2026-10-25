# Cadrage et responsabilités

## Objectif

Handfinity vise le remplacement progressif de la souris et du clavier sur PC,
dans les logiciels existants, y compris le navigateur. L'utilisation ne doit
pas nécessiter une intégration dans chaque site web. Le smartphone et les
lunettes AR sont des perspectives ultérieures, avec leur propre étude de
faisabilité et leur propre intégration système.

Windows 11 x64 est la première cible PC retenue, avec Electron 45.0.0. Le projet
est développé sous WSL2 et les essais web de l'utilisateur se font dans Firefox
Windows. Le lancement bureau depuis WSL2 ouvre Electron Windows : les calculs
et la webcam restent sur la machine Windows utilisée.

Electron permet de réutiliser Vue, TypeScript et la vision dans un Chromium
embarqué, tout en gérant la fenêtre et le cycle de vie de l'application locale.
Ce choix conserve le moteur indépendant des API de contrôle Windows ; il ne
remplace pas la validation réelle de la caméra, de l'arrière-plan et des entrées.

Le même projet et le même moteur serviront à une future version Linux, avec
des adaptations de contrôle propres au système. Un PC Ubuntu désigne ici un
éventuel poste d'utilisation ; le VPS peut héberger le site. Le futur objectif
mobile est de contrôler les applications d'un téléphone Android par les gestes
vus par sa caméra frontale. Cette intégration native n'est pas implémentée.

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
| Fenêtre Electron, origine locale et permissions | `apps/desktop/src/main.ts` | Application bureau |
| Lancement Electron de la plateforme, Windows depuis WSL2 | `apps/desktop/scripts/start.mjs` | Commandes bureau |
| Interface bureau réutilisée | `playground/view` via `apps/desktop/src/renderer/` | Fenêtre Handfinity Desktop |
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

L'application bureau importe directement `playground/view` et compile cette
interface avec Vite. Elle réutilise donc les mêmes packages `core`, `vision`
et `interactions`, ainsi que l'exécuteur de simulation. Le processus principal
Electron crée la fenêtre et sert les fichiers compilés depuis
`handfinity://app/` ; il ne reconnaît aucun geste.

Cette page locale est le seul contexte autorisé à demander la caméra vidéo,
dans la fenêtre principale. Le microphone, la capture d'écran, les navigations
et les nouvelles fenêtres sont refusés. Le renderer utilise l'isolation de
contexte et le sandbox, sans intégration Node.js ni pont IPC sans consommateur.
Le confinement des fichiers et les permissions sont testés séparément.

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

L'étape 9 règle `backgroundThrottling: false` dès la création de la fenêtre
Electron pour désactiver la limitation des timers en arrière-plan. Ce réglage
seul n'a pas suffi : lors de l'essai Windows réduit, la boucle d'animation
ne traitait qu'environ une image par seconde.

Le renderer bureau transmet donc `trackingOptions: { scheduling: "timer" }`
à la vue partagée. Celle-ci appelle `createTrackingSession` avec ces options :
`scheduling: "timer"` réarme `window.setTimeout` après chaque traitement, avec
un délai de `1000 / 30` ms. La cadence maximale visée est de 30 itérations par
seconde ; le coût du traitement s'ajoute au délai et aucune cadence n'est
garantie. La boucle reste ainsi indépendante de `requestAnimationFrame`.
Sans option, la session web conserve sa cadence par frames d'animation.

La session conserve sa vidéo HTML, une seule boucle et son unique suivi
d'identités ; la vue alimente toujours le même moteur commun. L'arrêt annule
le callback avec `clearTimeout` ou
`cancelAnimationFrame` selon la cadence choisie, puis libère les ressources.
Les protections du renderer et les permissions restent inchangées ; aucun
pont IPC ni seconde chaîne d'interprétation n'est ajouté.

Le diagnostic **Images processed** augmente uniquement lorsqu'une nouvelle image
a été traitée par la vision puis le moteur, y compris lorsqu'aucune main n'est
détectée. Une itération sans nouvelle image ne l'incrémente pas. Il revient à
zéro à l'arrêt. Le compteur de commandes ne suffit pas à observer la continuité :
une image valide sans pointage ne produit aucun déplacement.

Les essais natifs Windows avec caméra simulée ont vérifié la continuité :
388 images traitées pendant 30 secondes de réduction, avec progression des
images décodées et changement des pixels vidéo. L'arrêt, la reprise et la
fermeture du processus ont aussi été vérifiés. Le parcours avec une vraie
webcam, dont la perte et le retour d'une main, reste à valider.
Avec ce réglage Electron, `visibilityState` reste
`visible` même lorsque la fenêtre est réduite : les essais doivent vérifier son
état Windows réel et la progression des images traitées. La réduction conserve
le suivi ; **Stop camera** libère les ressources et la fermeture quitte
l'application. Les entrées système commencent à l'étape 10 et l'installeur de
distribution reste prévu à l'étape 27.

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

1. Validation réelle du bootstrap sur Windows 11 x64 : réutilisation du moteur,
   chargement MediaPipe, accès webcam, arrêt et fermeture. Electron est retenu ;
   le build et les tests unitaires seuls ne prouvent pas ce parcours Windows.
2. Suivi continu quand l'utilisateur change d'application ou réduit la fenêtre.
   Le réglage Electron de l'étape 9 et le compteur d'images traitées sont présents ;
   vérifier la continuité, les pertes et retours de mains, la restauration et
   le nettoyage sous Windows, notamment avec la vraie webcam.
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

Le socle de l'application PC est présent ; il affiche encore les diagnostics
et la simulation du Playground. Aucun exécuteur système, contrôle Linux,
intégration Android, interface AR ou bibliothèque publiée n'est livré.

Un hébergement du site sur VPS ou PC Ubuntu fournit les fichiers web au
navigateur. Il ne déplace pas automatiquement la reconnaissance vers cet
hébergement. Dans le bureau, l'application Electron exécute la vision et le
moteur localement. Un calcul distant demanderait une acquisition et un transport
distincts, qui ne font pas partie du bootstrap.

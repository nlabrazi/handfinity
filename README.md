<a name="readme-top"></a>

<!-- PROJECT SHIELDS -->
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![ISC License][license-shield]][license-url]
[![LinkedIn][linkedin-shield]][linkedin-url]

<!-- ABOUT THE PROJECT -->
# 🖐️ Handfinity

<p align="center">
  <a href="http://localhost:3000">
    <img src="public/screenshot.png" alt="Handfinity Screenshot" width="100%" height="400" />
  </a>
</p>

### ℹ️ Description

**Handfinity** est un projet d'**interface gestuelle par webcam** visant à remplacer progressivement la **souris et le clavier sur PC**, dans les applications existantes. Le smartphone, puis les lunettes de réalité augmentée, seront étudiés après validation de l'usage sur PC.

**État actuel :** le [site d'accueil](apps/hub/README.md), le [Playground](apps/playground/README.md) et l'[application bureau Electron](apps/desktop/README.md) sont présents. Le bureau réutilise le même moteur et ajoute le **déplacement du vrai curseur Windows sur l'écran principal**, après démarrage de la caméra et activation explicite. L’étape 10 est validée dans `a2449a7` ; le navigateur conserve la simulation. L’étape 11 de pause/reprise par paume ouverte maintenue **1,5 seconde** est validée dans `66efba1`. L’étape 12 rend obligatoire le choix de la main dans **Main hand** et bloque les réattributions automatiques après perte, à valider avec la webcam. **Clics, défilement et saisie clavier restent à construire.**

- 🧭 **Connexion directe** : Accès à la webcam depuis le navigateur, avec démarrage et arrêt explicites.
- 🎮 **Un accueil et un laboratoire** :
  - **Accueil** : Présentation de Handfinity et accès au laboratoire sur `/playground`, avec une identité visuelle animée.
  - **Vision Playground** : Diagnostic des identités, des postures et des pointeurs, avec aperçu vidéo en miroir, journal des commandes et curseur simulé.
  - **Application bureau** : Fenêtre Electron **Handfinity Desktop**, utilisant la vue du Playground et ses packages partagés, avec commandes d'activation et d'arrêt du pointeur Windows. Windows 11 x64 est la première cible de validation.
  - **Packages partagés** : `@handfinity/core` pour les modèles et la reconnaissance, `@handfinity/vision` pour la session caméra, `@handfinity/interactions` pour le moteur commun et ses commandes de déplacement.
- 👓 **Objectif d'interaction sans contact** : Pointer, cliquer, déplacer, défiler et invoquer un clavier pour écrire dans l'application utilisée.
- ⚡ **Stack actuelle** : Vue 3, Vite, TypeScript, Tailwind CSS v4, Electron 45.0.0 et npm Workspaces avec Node.js 24. Un projet commun, avec de futures adaptations de contrôle propres à Windows et Linux.
- 🎨 **Rendu Canvas 2D** : Affichage des repères et des pointeurs dans l'aperçu vidéo du Playground.
- 🔊 **Retour visuel en direct** : Posture confirmée et candidate, estimation des doigts, coordonnées et rôle de chaque main.
- 🧹 **Outillage** : Biome v2 pour le lint et le formatage, y compris les fichiers Vue.
- 🧪 **Qualité & Tests** : 431 tests passent pour l’étape 12 et le socle conservé, ainsi que lint, formatage et builds web/bureau. Les commandes web sont utilisées en CI Jenkins ; les essais natifs Windows et la vraie webcam complètent les tests automatisés.
- 🐳 **Développement Docker** : Deux services conservés, sources montées en volumes et hot reload Vite avec polling.

Le [cadrage technique](docs/architecture.md) décrit les responsabilités et limites actuelles. Le [découpage en commits](docs/roadmap.md) précise la suite.

---

## ⚖️ Confidentialité & Utilisation de la Webcam

Handfinity est conçu pour expérimenter la vision par ordinateur tout en limitant la circulation des données caméra :
1. **Traitement sur l'appareil utilisé** : La webcam et **MediaPipe Tasks Vision** s'exécutent dans le navigateur pour le web, ou dans la fenêtre Electron pour le bureau. Le démarrage télécharge les fichiers MediaPipe et le modèle depuis leurs hébergements externes ; aucun enregistrement vidéo ni envoi des images à un serveur applicatif n'est implémenté.
2. **Contrôle explicite de la caméra** : **Start camera** demande la webcam ; **Stop camera** ferme la session. Le navigateur et Windows peuvent refuser l'accès. L'application bureau autorise uniquement la vidéo depuis sa page locale, sans microphone ni capture d'écran. Les ressources vidéo et le suivi sont libérés à l'arrêt.
3. **Précaution pour un déploiement public** :
   > *Sur le web, l'accès à la caméra nécessite un contexte sécurisé (HTTPS ou localhost). Handfinity n'a actuellement ni authentification, ni stockage distant des vidéos, ni base de données. Tout ajout futur de collecte devra être documenté explicitement.*

---

## 🎮 Moteur de Reconnaissance Gestuelle (Vision Partagée)

Le socle actuel repose sur MediaPipe et trois packages internes :

- 🪟 **Acquisition vidéo locale** : Capture de la webcam et aperçu en miroir.
- 🖱️ **Suivi de deux mains** : Détection des repères et association d'identités locales à la session.
- 🎯 **Postures stabilisées** : Pointage, ouverture des cinq doigts, pincement et posture inconnue.
- ⏸️ **Pause volontaire** : Maintenir les cinq doigts ouverts pendant 1,5 seconde suspend les commandes ; refaire le geste après avoir replié les doigts permet de reprendre. La caméra reste active.
- 📌 **Main principale explicite** : Choix obligatoire d’une identité visible dans **Main hand** ; perte définitive ou ambiguïté imposent une nouvelle sélection.
- 🌐 **Packages partagés** : `core` définit les modèles et la reconnaissance ; `vision` possède la session caméra, la détection et les identités ; `interactions` assemble les postures et les pointeurs dans le moteur commun.
- ⚡ **Actualisation continue** : Analyse des nouvelles images ; les images répétées ne confirment pas de nouvelle posture et ne sont pas lissées à nouveau.
- 🔌 **Gestion du cycle de vie** : Initialisation, arrêt, fermeture du détecteur et nettoyage des états.
- ⌨️ **Commandes de déplacement partagées** : Le moteur produit `pointer:move` pour la main principale en pointage ; le Playground les exécute en simulation et le bureau peut les transmettre au curseur Windows après activation.

### 🏆 Vision Playground & Diagnostics

Le **Playground** permet d'observer ce que reconnaissent les briques partagées :

- **Démarrage manuel** : Le bouton **Start camera** demande l'accès à la caméra ; **Stop camera** ferme la session.
- **Aperçu en miroir** : Vidéo, repères et pointeurs partagent le même affichage.
- **Identités des mains** : Numéros, latéralité, états `tracked` et `missing`, apparitions, pertes et ambiguïtés.
- **Postures** : **Hand poses** affiche les postures confirmées et candidates, les estimations des doigts et le ratio de pincement.
- **Pointeurs** : L'index tendu, les trois autres doigts repliés et le pouce séparé activent un cercle dans la vidéo. Le contour plein désigne la main principale ; le pointillé la seconde main.
- **Choix de la main principale** : **Main hand** sélectionne une identité visible ou libère le contrôle. Le message distingue une absence brève d’une sélection définitivement perdue.
- **Pause et reprise** : **Gesture control** affiche l’état commun, la progression du maintien et le besoin de relâcher le geste. La pause bloque la simulation et le contrôle Windows activé.
- **Commandes et simulation** : **Pointer commands** affiche un curseur dans une zone dédiée, les huit dernières commandes et le nombre total reçu.
- **Limite du navigateur** : Le cercle vidéo et le curseur simulé restent dans le laboratoire web. Le déplacement du pointeur Windows demande l'application bureau et son activation explicite.

### ⏱️ Réactivité & Fiabilité de la Détection
- **Analyse vidéo continue** : Le Playground traite les nouvelles images de la caméra et dessine les connexions entre les points de repère pour visualiser les mouvements.
- **Confirmation des postures** : Les durées de stabilité limitent les changements dus à de brèves variations ; les essais réels restent nécessaires selon la webcam, l'éclairage et les mouvements.

### Modèle d'observation partagé

Le détecteur interne de `@handfinity/vision` convertit les résultats MediaPipe
en observations `HandObservation`, dont les types sont définis dans
`@handfinity/core`. Une image sans main produit un tableau vide :

- `landmarks` : les 21 repères `{ x, y, z }`, dans l'ordre du détecteur
  (poignet : 0, bout du pouce : 4, bout de l'index : 8, base du majeur : 9).
  `x` et `y` sont normalisés par les dimensions de l'image source, avant le
  miroir appliqué à l'affichage. `z` est relatif au poignet, à une échelle proche
  de `x` ; il ne s'agit pas d'une distance en mètres.
- `handedness` : `left`, `right` ou `unknown`. La classification porte sur
  l'image transmise au détecteur ; le miroir CSS de l'aperçu ne la modifie pas.
- `handednessConfidence` : score de classification gauche/droite entre 0 et 1,
  ou `null` si la latéralité est absente ou inconnue. Il ne représente pas la
  confiance globale du suivi ou la précision des repères.
- `timestamp` : horodatage monotone en millisecondes passé à `detect`, commun
  aux mains d'une même image. Les applications utilisent `performance.now()`.

Les observations sont des instantanés indépendants des objets MediaPipe,
exposés en lecture seule dans les types. Leur ordre et leur latéralité ne sont
pas des identifiants stables entre deux images. Le suivi des identités permet
d'associer au plus deux mains entre les images.

Les conventions des repères et des résultats sont décrites dans la
[documentation MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js#handle_and_display_results).

### Identités des mains

`createHandIdentityTracker`, exporté par `@handfinity/core`, associe les observations
d'au plus deux mains dans le temps. `update(observations, timestamp, aspectRatio)`
retourne les pistes identifiées (`tracked` ou `missing`) et les événements
`hand:found` / `hand:lost`. `advance(timestamp)` expire le suivi même sans nouvelle
image ; `reset()` efface l'état sans réutiliser les anciens numéros.

Une absence brève peut conserver l'identité pendant 120 ms si la main réapparaît
à proximité. Une ambiguïté termine les identités concernées ; une nouvelle
identification commence quand les observations deviennent distinctes. La position
et la taille des paumes guident l'association, avec la latéralité comme indice
secondaire. Cette continuité est locale à la session, sans garantie de
réidentification physique après occultation.

Le [Playground](apps/playground/README.md#diagnostics) affiche les numéros,
les états et les transitions pour les essais. Une identité expirée ne constitue
pas une reconnaissance persistante d'une main physique.

### Postures des mains

`createHandPoseTracker`, exporté par `@handfinity/core`, reçoit les résultats du
suivi d'identités via `update(trackingFrame, aspectRatio)`. Il produit une posture
par main, avec sa candidate, son état de confirmation et les mesures des doigts :

- `pointing` : index tendu, majeur, annulaire et auriculaire repliés. Le pouce
  peut rester libre, tant qu'il ne forme pas un pincement.
- `open-palm` : les cinq doigts sont tendus, avec le pouce éloigné de la paume.
- `pinch` : pouce et index rapprochés ; cette posture est prioritaire. Le
  détecteur existant conserve ses seuils distincts d'entrée et de sortie et ses
  confirmations de 40 ms à la fermeture et 60 ms au relâchement.
- `unknown` : aucune des configurations reconnues n'est confirmée.

Pointage et paume ouverte demandent 80 ms d'observations cohérentes. Les angles
des doigts utilisent les repères `{ x, y, z }` corrigés du format vidéo ; le
pincement utilise également la profondeur relative, pour ne pas confondre une
superposition à l’image avec un contact des doigts. Ces heuristiques
doivent être éprouvées avec la webcam, notamment lorsque la main est inclinée
ou partiellement cachée.

Chaque identité possède son propre état. Une absence interrompt immédiatement
la posture et sa confirmation ; une reprise demande une nouvelle confirmation.
Les images répétées ne confirment aucune posture, et une identité perdue ou
ambiguë perd également son état de reconnaissance. `reset()` efface les états à
l'arrêt de la session.

Le panneau **Hand poses** du Playground présente les postures confirmées et
candidates, l'estimation des doigts et le ratio de pincement. Ces diagnostics
permettent de valider la reconnaissance avant de l'utiliser dans les interactions.

### Pointeurs et main principale

Le package interne `@handfinity/interactions` dépend de `core` et s'exécute sans
Vue ni DOM. Le moteur commun utilise `createHandPointerTracker` pour produire les
positions normalisées des index, leur posture, leur état actif et la main principale.
Seul un pointage confirmé dans l'image active le pointeur. Le lissage est isolé
par identité et réinitialisé après un repos ou une absence ; une image déjà
traitée n'est pas filtrée une seconde fois.

Aucune main ne commande au démarrage. `setPrimaryHand(id)` choisit explicitement
une identité actuellement suivie ; `setPrimaryHand(null)` libère le contrôle.
Une main au repos ou brièvement manquante conserve son rôle. Après expiration
ou ambiguïté, sa sélection reste marquée `lost` ou `ambiguous` et aucune autre
identité ne prend le relais. Il faut choisir une main visible dans **Main hand**.
La latéralité ne réattribue pas le contrôle à une nouvelle identité.

`HandPointerFrame.selectionStatus` distingue `unselected`, `tracked`, `missing`,
`lost` et `ambiguous`. Le choix perdu reste affiché, avec une invitation à
sélectionner de nouveau. Les autres pointeurs de diagnostic continuent à suivre
les mains. Ces identités sont locales et ne garantissent pas une reconnaissance
physique persistante après occultation.

Le [Playground](apps/playground/README.md#diagnostics) affiche ces pointeurs dans
la vidéo. Les coordonnées **Source x/y** du panneau restent celles de l'image
avant miroir. L'activation du contrôle Windows est gérée par l'application
bureau. Les états de pause et de reprise volontaires appartiennent au moteur
commun à l’étape 11.

### Commandes PC et moteur commun — à construire

`createGestureEngine`, exporté par `@handfinity/interactions`, centralise déjà
la chaîne postures → pointeurs consommée par le Playground.
`update(trackingFrame, aspectRatio)` retourne `{ tracking, poses, pointers, control, commands, selectionChanged }` ;
`setPrimaryHand(id)` applique le choix et renvoie un instantané sans commande.
`reset()` efface ensemble
postures, lissage, sélection de main et pause volontaire. Les identités restent fournies par la session
de vision, sans second suivi dans le moteur.

Une commande `PointerMoveCommand` contient `type: "pointer:move"`, `handId`,
`timestamp` et `position: { x, y }`. Sa destination est normalisée entre 0 et 1,
avec l'origine en haut à gauche ; le moteur applique déjà le miroir horizontal
(`x = 1 - Source x`, `y = Source y`). La simulation consomme cette destination
directement. Le point source reste celui du pointeur lissé.

Seule une nouvelle observation de la main explicitement sélectionnée en pointage confirmé
produit une commande, au plus une fois par image. Une image répétée, une main
au repos, manquante ou ambiguë n'en produit pas. Le curseur simulé conserve sa
dernière position sans commande ; l'arrêt efface sa position, le journal et le
compteur. L'application bureau utilise ces mêmes commandes :

```text
Observations → Interprétation commune → Commandes
                                          ├── Simulation dans le Playground
                                          └── Exécution sur le PC
```

La simulation permet de diagnostiquer les commandes effectivement produites.
L'exécuteur Windows de l'étape 10 convertit leurs destinations en pixels
physiques de l'écran principal entier, sans second miroir. L’utilisateur a validé
ce lot dans `a2449a7`, en reportant les améliorations restantes de fluidité. La calibration de la zone des mains est prévue à l'étape 13 ;
les boutons, le défilement et la saisie clavier viendront ensuite.

Windows 11 x64 et Electron sont retenus pour la première application bureau.
Le développement se fait sous WSL2 ; la fenêtre Electron s'exécute directement
sous Windows et utilise sa webcam. Le moteur et l'interface restent communs
aux futures versions Windows et Linux ; leurs exécuteurs système seront adaptés
séparément. Le [cadrage](docs/architecture.md) et la [roadmap](docs/roadmap.md)
détaillent ce périmètre.

Après **Start camera**, la fenêtre bureau maintient le suivi lorsqu'elle perd
le focus ou est réduite. **Images processed** compte les nouvelles images
analysées puis transmises au moteur, même sans main détectée. **Stop camera**
remet ce compteur à zéro et libère la caméra ; fermer l'application arrête le
suivi. L'utilisateur a validé ce suivi en arrière-plan avec sa vraie webcam,
puis commité et poussé l'étape 9 dans `9804677`. Le navigateur web conserve sa
gestion habituelle des onglets en arrière-plan.

Dans le bureau, **Enable Windows pointer** active séparément le vrai curseur
après **Start camera** et choix d’une main dans **Main hand**. **Stop Windows pointer** ou **Ctrl + Alt + Esc** l'arrête,
y compris dans une autre application. Le repos ou la perte de suivi suspend les
déplacements ; une nouvelle commande valide les reprend tant que le contrôle
reste activé. **Stop camera** et la fermeture désactivent aussi le contrôle et
remettent la sélection à zéro.
Les essais natifs Windows avec caméra simulée et commandes synthétiques ont
vérifié le déplacement réel, les arrêts et le nettoyage. La validation du
pointage avec la vraie webcam reste nécessaire.

Le curseur interpole des positions intermédiaires entre les cibles du moteur,
sans prédiction et en conservant les arrêts sur perte de suivi. Dans une
comparaison Windows avec 30 cibles synthétiques en environ 3,4 secondes, la
première correction produit 195 positions distinctes au lieu de 30, soit environ 57
positions par seconde contre 9. Cela ne garantit ni 120 ni 244 Hz ; la cadence
de capture et la fluidité du curseur sont deux mesures différentes. L’utilisateur
a confirmé cette amélioration au premier plan, puis signalé des coupures fenêtre
réduite et des pertes de pointage près du torse. Le bureau conserve désormais
la vitesse de calcul de son processus de vision en arrière-plan via une politique
de performance Windows propre à ce processus ; le moteur corrige aussi
les faux pincements liés à la rotation de la main. Ces corrections restent à
éprouver avec la vraie webcam.

Le moteur conserve aussi l’état `control` : `paused`, `holdProgress`, `handId`
et `requiresRelease`. Une paume ouverte confirmée, maintenue 1 500 ms sur de
nouvelles observations, bascule la pause. Seule la main principale est prise en
compte ; sans sélection valide, aucun geste de pause/reprise n’est accepté. Une perte,
une ambiguïté, un changement de main ou une autre posture annule un maintien
incomplet. Le pointage et la perte de suivi ne retirent jamais une pause acquise.

Après chaque basculement, il faut replier clairement les doigts ou repointer
avant de refaire le geste : garder la paume ouverte, ou simplement la masquer et la
ramener ouverte, ne rebascule pas le contrôle. En pause, la détection et les
pointeurs de diagnostic continuent ; le moteur n’émet plus de déplacements.
Le pont bureau transmet explicitement cette pause au main, qui annule les
trajectoires et conserve son état `paused`. Une reprise gestuelle attend un
nouveau pointage. **Stop camera** remet le moteur à zéro ; **Stop Windows pointer**
et **Ctrl + Alt + Esc** restent des désactivations exigeant le bouton d’activation.

À l’étape 12, changer **Main hand** annule immédiatement l’ancienne trajectoire,
sans attendre l’image caméra suivante. Ce résultat porte `selectionChanged` et
aucune commande. Le renderer date cette annulation avec l’heure du choix ; les
déplacements conservent l’heure réelle de leur image. Le main ne raccorde pas
les positions de deux identités par une interpolation. Une pause acquise reste
active lors du choix d’une autre main.

### Sessions de suivi communes

Le Playground utilise `createTrackingSession` dans `@handfinity/vision`.
Chaque instance possède sa caméra, son détecteur, sa boucle vidéo et son suivi
d'identités. `start(video)` initialise le suivi ; `stop()` est disponible dès la
création de la session, y compris pendant un démarrage en attente. Une même
instance peut être arrêtée puis redémarrée.

L'option facultative `scheduling: "timer"` permet au bureau de programmer chaque
passage avec un budget de `1000 / 30` ms incluant le traitement précédent.
Seul le temps restant est attendu, sans rattrapage si l'analyse dépasse ce
budget. Sans option, le web utilise `requestAnimationFrame`. Le traitement des images, les
identités et le nettoyage restent dans la même session. Lorsque le navigateur
expose un compteur `getVideoPlaybackQuality` positif pour le flux, ce compteur
distingue les nouvelles images : `currentTime` peut avancer sans qu’une image
arrive. La session conserve le contrôle par `currentTime` si ce compteur est
absent ou reste nul depuis le démarrage, notamment pour les flux Firefox.

Le callback `onFrame` reçoit les observations, le suivi des identités, le ratio
d'image et `hasNewFrame`. Ce dernier distingue une nouvelle image d'une simple
avancée du temps : l'expiration du suivi continue sans rejouer la détection.
`onError` signale une erreur de la boucle après nettoyage ; les erreurs
d'initialisation rejettent la promesse de `start`.

Quitter le laboratoire arrête sa session. Un arrêt libère immédiatement les
ressources disponibles ; un flux ou détecteur reçu ensuite est libéré à son
arrivée, sans relancer le suivi ni modifier la session suivante. Le Playground
transmet chaque résultat de suivi au moteur commun, même sans nouvelle image,
puis affiche ses diagnostics. Il réinitialise le moteur à l'arrêt et garde
uniquement le rendu et les états d'interface dans Vue.

### Lancement et distribution des applications

#### En développement :
```bash
# Accueil : http://localhost:3000 ; laboratoire : /playground
npm run dev

# Facultatif : laboratoire autonome sur http://localhost:3002
npm run dev -w playground

# Fenêtre Windows Electron depuis WSL2 : compile puis lance l'application
npm run dev:desktop
```
Le hub donne accès aux deux pages. Docker Compose permet également de lancer
leurs services de développement web. Le lancement bureau est décrit dans le
[guide Desktop](apps/desktop/README.md) ; il ouvre une vraie application Windows
depuis WSL2 et ne nécessite pas de second clone Windows. À cette étape, une
modification demande de fermer la fenêtre puis de relancer la commande.

#### En production (Build statique des applications) :
```bash
npm run build
```
La commande compile les interfaces Vue avec Vite :

- **Hub** : `apps/hub/dist/`, contenant l'accueil et le laboratoire intégré.
- **Playground** : `apps/playground/dist/`, pour le laboratoire autonome.
- **Distribution web** : Fichiers statiques pouvant être servis par Nginx derrière un hébergement HTTPS.

`npm run build:desktop` compile séparément le processus Electron et son
interface partagée ; `npm run start:desktop` lance ce build. L'exécutable
Electron est téléchargé au premier lancement. L'installeur Windows destiné à
la distribution reste prévu à l'étape 27.

> [!NOTE]
> **Accès webcam en production :** HTTPS ou localhost est nécessaire. Ces builds
> distribuent les interfaces web ; ils ne constituent pas une application capable
> de contrôler les entrées du PC.

---

## 🚀 Progression & Roadmap

- [x] **Socle, infrastructure et monorepo**
  - [x] Vue 3, Vite, TypeScript, Tailwind CSS v4 et npm Workspaces
  - [x] Biome, tests Vitest, CI Jenkins et développement Docker
- [x] **Vision et diagnostics**
  - [x] Session webcam redémarrable et détection MediaPipe
  - [x] Modèle d'observation partagé et suivi de deux identités
  - [x] Postures stabilisées, pointeurs et main principale
  - [x] Accueil et Playground de diagnostic
- [x] **Recadrage sur le contrôle du PC**
  - [x] Retrait des applications et expériences abandonnées
  - [x] Nettoyage des dépendances, exports, assets et configurations associés
  - [x] Responsabilités et limites actuelles documentées
- [x] **Moteur commun et premier contrôle du PC — étapes 6 à 10**
  - [x] Centralisation de la chaîne postures → pointeurs consommée par le Playground
  - [x] Commandes de déplacement partagées et simulation dans le Playground
  - [x] Socle de l'application Electron Windows réutilisant le Playground
  - [x] Suivi en arrière-plan validé avec la vraie webcam
  - [x] Déplacement du vrai curseur Windows validé dans `a2449a7`
- [ ] **Souris utilisable — étapes 11 à 18**
  - [x] Pause et reprise gestuelles validées dans `66efba1`
  - [ ] Sélection de la main implémentée, à valider
  - [ ] Calibration de la zone de contrôle
  - [ ] Clic principal, déplacement avec maintien, clic secondaire et défilement
  - [ ] Conservation des réglages
- [ ] **Clavier à la demande — étapes 19 à 24**
  - [ ] Clavier superposé, invocation gestuelle et sélection des touches
  - [ ] Saisie dans l'application destinataire, édition et raccourcis
- [ ] **Validation et distribution — étapes 25 à 27**
  - [ ] Parcours complets, vérifications Windows et application distribuable
- [ ] **Perspectives ultérieures**
  - [ ] Étude du contrôle d'Android par les gestes vus par sa caméra frontale
  - [ ] Adaptation et validation du contrôle sur un PC Ubuntu
  - [ ] Étude des lunettes de réalité augmentée selon le matériel retenu

Les étapes de recadrage 1 à 5 ont été livrées ensemble dans **un seul commit,
`7f6d27b`** ; elles ne correspondent pas à cinq commits distincts. La suite suit
le [découpage détaillé](docs/roadmap.md), un petit lot à la fois, avec tests et
validation utilisateur.

---

## Utiliser Handfinity

1. **Ouvrir le laboratoire** : depuis l'accueil, accéder à **Playground**. La caméra reste arrêtée jusqu'à l'action **Start camera** et l'autorisation du navigateur.
2. **Observer le suivi** : présenter une ou deux mains séparées pour lire leurs numéros, états et postures dans les diagnostics.
3. **Sélectionner la main de contrôle** : choisir son numéro dans **Main hand**. Sans sélection, les mains restent suivies mais aucune commande n’est émise. Après perte définitive ou ambiguïté, sélectionner une main visible de nouveau.
4. **Activer un pointeur** : tendre l'index, replier majeur, annulaire et auriculaire et séparer le pouce de l'index. Un cercle apparaît dans la vidéo ; son contour plein désigne la main principale. Cette main déplace aussi le curseur de **Pointer commands** et alimente son journal.
5. **Mettre en pause et reprendre** : maintenir les cinq doigts ouverts pendant 1,5 seconde. Le panneau **Gesture control** passe à **Paused** ; repointer ne déplace plus le curseur. Replier les doigts ou repointer brièvement, puis refaire le maintien pour reprendre.
6. **Choisir et arrêter** : utiliser **Main hand** pour changer de main principale et **Stop camera** pour libérer la session. Quitter le laboratoire coupe également la caméra.

**Dans l'application Windows :** après **Start camera** et le choix dans **Main hand**, cliquer sur
**Enable Windows pointer** pour déplacer le vrai curseur de l'écran principal.
**Stop Windows pointer** et **Ctrl + Alt + Esc** désactivent ce contrôle tout en
gardant la caméra active. Le [guide Desktop](apps/desktop/README.md#vérifications-manuelles)
précise les essais et leurs résultats attendus.

**Caméra et aide :** le laboratoire n'est pas conservé en cache à la navigation.
Y revenir demande un nouveau démarrage explicite. Un message s'affiche en cas
d'échec d'initialisation ou d'indisponibilité du périphérique.

**Lecture des gestes :** les repères sont estimés à partir de l'image ; la
visibilité des doigts, l'éclairage et la qualité vidéo influencent le résultat.
Le [guide de vérification](apps/playground/README.md#vérifications-manuelles)
détaille les postures et résultats attendus.

---

## 💻 Installation & Démarrage

### Prérequis
* **Node.js 24** et npm pour le développement local, les tests et la CI Jenkins ; Docker utilise également Node.js 24.
* Une webcam fonctionnelle et un navigateur récent autorisant `getUserMedia()` sur localhost ou en HTTPS.
* Pour le bureau : Windows 11 x64 ; depuis WSL2, interopérabilité Windows et `unzip` disponibles. Le [guide Desktop](apps/desktop/README.md) détaille le lancement et les téléchargements nécessaires.

### Option A : Lancer en local

```bash
# 1. Cloner le dépôt
git clone https://github.com/nlabrazi/handfinity.git
cd handfinity

# 2. Installer les dépendances
npm ci

# 3. Ouvrir l'accueil et le laboratoire
npm run dev
# Accueil : http://localhost:3000
# Playground : http://localhost:3000/playground
```

### Option B : Développer avec Docker

Les services conservés sont `hub` et `playground`. Le hub suffit pour ouvrir
l'accueil et le laboratoire intégré sur le port **3000** :

```bash
docker compose up --build hub
```

Le laboratoire peut aussi être lancé seul sur le port **3002** :

```bash
docker compose up --build playground
```

Les sources sont montées dans `/app` ; chaque service possède son volume de
dépendances et exécute `npm ci` au démarrage. Vite utilise le polling pour
le hot reload, notamment en environnement Docker / WSL2.

Après un changement des dépendances ou de la configuration :

```bash
docker compose up -d --build --force-recreate hub
```

Une modification Vue valide doit être appliquée dans le navigateur. En cas
d'erreur, consulter sa console et `docker compose logs -f hub` ou `playground`.
Ces conteneurs servent le développement web ; ils ne contrôlent pas le PC hôte.

---

## 🌐 Déploiement sur VPS et exécution côté navigateur

**État actuel : l'accueil et le laboratoire fonctionnent en local. La cible de
production web a été construite et vérifiée avec Nginx ; la publication publique
et la configuration HTTPS ne sont pas mises en place par cette image.**

Aujourd'hui, les images webcam sont analysées dans le navigateur pour afficher
les diagnostics :

```text
Webcam → Navigateur → MediaPipe / vision → Suivi et postures → Diagnostics
```

Un hébergement web peut servir les fichiers statiques sans recevoir les images
de la webcam. Il faut distinguer l'hébergement des pages, le traitement vidéo
local et le contrôle des entrées du PC. Le déplacement du curseur Windows
utilise l'application bureau exécutée sur le poste de l'utilisateur.

```text
Navigateur utilisateur                  Hébergement web
Webcam + MediaPipe ← HTTPS ← Serveur frontal ← Nginx / Fichiers statiques Vue
```

Le `docker-compose.yml` lance les serveurs de développement avec hot reload.
Le Dockerfile conserve une cible `prod` basée sur Nginx, avec le hub par défaut :

```bash
docker build --target prod -t handfinity-web .
# Laboratoire autonome : ajouter --build-arg APP=playground
```

Le fallback de `nginx.conf` permet le rechargement direct de `/playground`.
HTTPS doit être fourni par l'hébergement hors localhost. Cette distribution
web reste distincte de l'application bureau Electron.

---

## 🛠️ Scripts Disponibles

| Commande | Description |
| :--- | :--- |
| `npm run dev` | Démarre l'accueil et le laboratoire intégré sur le port 3000 |
| `npm run dev -w playground` | Démarre le laboratoire autonome sur le port 3002 |
| `npm run build` | Compile le Playground autonome puis le hub intégré |
| `npm run dev:desktop` | Compile et lance la fenêtre Electron ; depuis WSL2, exécute la version Windows |
| `npm run build:desktop` | Compile le processus Electron, le preload et l'interface partagée |
| `npm run start:desktop` | Lance la dernière compilation bureau, sans reconstruire |
| `npm run lint` | Exécute le linter Biome |
| `npm run format` | Formate le code avec Biome |
| `npm run format:check` | Vérifie le formatage sans modifier les fichiers |
| `npm run check` | Lance `biome check .` |
| `npm test -w @handfinity/core` | Exécute les tests unitaires du core |
| `npm test` | Exécute les tests du core, du moteur, de la simulation, de la vision, du bureau et des transitions du hub |
| `docker compose up --build hub` | Démarre l'accueil et le laboratoire intégré dans Docker |
| `docker compose up --build playground` | Démarre le laboratoire autonome dans Docker |

Les commandes `npm test`, `npm run lint`, `npm run format:check` et `npm run build`
constituent les vérifications utilisées en CI. Les essais webcam et les essais
natifs sur le système PC cible complètent les tests automatisés.

---

## 📄 Licence & Contact

La métadonnée du projet indique actuellement la licence **ISC** dans `package.json`. Aucun fichier de licence dédié n'est encore présent à la racine du dépôt.

- 👤 **Nabil Labrazi** : [Portfolio](https://nabster.dev) • [LinkedIn](https://linkedin.com/in/nabil-labrazi) • [Email](mailto:na.labrazi@gmail.com)

[contributors-shield]: https://img.shields.io/github/contributors/nlabrazi/handfinity.svg?style=for-the-badge
[contributors-url]: https://github.com/nlabrazi/handfinity/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/nlabrazi/handfinity.svg?style=for-the-badge
[forks-url]: https://github.com/nlabrazi/handfinity/network/members
[stars-shield]: https://img.shields.io/github/stars/nlabrazi/handfinity.svg?style=for-the-badge
[stars-url]: https://github.com/nlabrazi/handfinity/stargazers
[issues-shield]: https://img.shields.io/github/issues/nlabrazi/handfinity.svg?style=for-the-badge
[issues-url]: https://github.com/nlabrazi/handfinity/issues
[license-shield]: https://img.shields.io/badge/License-ISC-blue.svg?style=for-the-badge
[license-url]: https://github.com/nlabrazi/handfinity/blob/master/package.json
[linkedin-shield]: https://img.shields.io/badge/-LinkedIn-black.svg?style=for-the-badge&logo=linkedin&colorB=555
[linkedin-url]: https://linkedin.com/in/nabil-labrazi

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

**État actuel :** le [site d'accueil](apps/hub/README.md) et le [Playground](apps/playground/README.md) sont fonctionnels. Le suivi des mains, les postures et les pointeurs sont disponibles dans le laboratoire ; **le contrôle de la souris et du clavier du système n'est pas encore implémenté**.

- 🧭 **Connexion directe** : Accès à la webcam depuis le navigateur, avec démarrage et arrêt explicites.
- 🎮 **Un accueil et un laboratoire** :
  - **Accueil** : Présentation de Handfinity et accès au laboratoire sur `/playground`, avec une identité visuelle animée.
  - **Vision Playground** : Diagnostic des identités, des postures et des pointeurs, avec aperçu vidéo en miroir.
  - **Packages partagés** : `@handfinity/core` pour les modèles et la reconnaissance, `@handfinity/vision` pour la session caméra, `@handfinity/interactions` pour les pointeurs et la main principale.
- 👓 **Objectif d'interaction sans contact** : Pointer, cliquer, déplacer, défiler et invoquer un clavier pour écrire dans l'application utilisée.
- ⚡ **Stack actuelle** : Vue 3, Vite, TypeScript, Tailwind CSS v4 et npm Workspaces avec Node.js 24. La technologie de l'application bureau reste à choisir.
- 🎨 **Rendu Canvas 2D** : Affichage des repères et des pointeurs dans l'aperçu vidéo du Playground.
- 🔊 **Retour visuel en direct** : Posture confirmée et candidate, estimation des doigts, coordonnées et rôle de chaque main.
- 🧹 **Outillage** : Biome v2 pour le lint et le formatage, y compris les fichiers Vue.
- 🧪 **Qualité & Tests** : Tests Vitest du socle et des transitions de page, exécutés par les commandes utilisées en CI Jenkins. Les essais avec la webcam complètent ces tests.
- 🐳 **Développement Docker** : Deux services conservés, sources montées en volumes et hot reload Vite avec polling.

Le [cadrage technique](docs/architecture.md) décrit les responsabilités et limites actuelles. Le [découpage en commits](docs/roadmap.md) précise la suite.

---

## ⚖️ Confidentialité & Utilisation de la Webcam

Handfinity est conçu pour expérimenter la vision par ordinateur tout en limitant la circulation des données caméra :
1. **Traitement côté navigateur** : La webcam est ouverte localement ; le traitement gestuel avec **MediaPipe Tasks Vision** s'exécute dans le navigateur. Le démarrage télécharge les fichiers MediaPipe et le modèle depuis leurs hébergements externes ; aucun enregistrement vidéo ni envoi des images à un serveur applicatif n'est implémenté.
2. **Contrôle explicite de la caméra** : L'utilisateur doit autoriser l'accès à la webcam et peut arrêter la session depuis les applications. Les ressources vidéo et le suivi sont libérés à l'arrêt.
3. **Précaution pour un déploiement public** :
   > *L'accès à la caméra nécessite un contexte sécurisé (HTTPS ou localhost). Handfinity n'a actuellement ni authentification, ni stockage distant des vidéos, ni base de données. Tout ajout futur de collecte devra être documenté explicitement.*

---

## 🎮 Moteur de Reconnaissance Gestuelle (Vision Partagée)

Le socle actuel repose sur MediaPipe et trois packages internes :

- 🪟 **Acquisition vidéo locale** : Capture de la webcam et aperçu en miroir.
- 🖱️ **Suivi de deux mains** : Détection des repères et association d'identités locales à la session.
- 🎯 **Postures stabilisées** : Pointage, ouverture des cinq doigts, pincement et posture inconnue.
- 📌 **Main principale explicite** : Choix automatique ou manuel d'une identité dans les diagnostics du pointeur.
- 🌐 **Packages partagés** : `core` définit les modèles et la reconnaissance ; `vision` possède la session caméra et la détection ; `interactions` produit les pointeurs et leur rôle.
- ⚡ **Actualisation continue** : Analyse des nouvelles images ; les images répétées ne confirment pas de nouvelle posture et ne sont pas lissées à nouveau.
- 🔌 **Gestion du cycle de vie** : Initialisation, arrêt, fermeture du détecteur et nettoyage des états.
- ⌨️ **Commandes PC à construire** : La production des commandes et leurs exécuteurs simulé et système sont prévus dans la roadmap. La chaîne complète d'interprétation reste à centraliser.

### 🏆 Vision Playground & Diagnostics

Le **Playground** permet d'observer ce que reconnaissent les briques partagées :

- **Démarrage manuel** : Le bouton **Start camera** demande l'accès à la caméra ; **Stop camera** ferme la session.
- **Aperçu en miroir** : Vidéo, repères et pointeurs partagent le même affichage.
- **Identités des mains** : Numéros, latéralité, états `tracked` et `missing`, apparitions, pertes et ambiguïtés.
- **Postures** : **Hand poses** affiche les postures confirmées et candidates, les estimations des doigts et le ratio de pincement.
- **Pointeurs** : L'index tendu, les trois autres doigts repliés et le pouce séparé activent un cercle dans la vidéo. Le contour plein désigne la main principale ; le pointillé la seconde main.
- **Choix de la main principale** : Le sélecteur **Main hand** permet de choisir une identité ou de revenir au mode automatique.
- **Limite actuelle** : Le cercle reste un diagnostic dans la vidéo ; il ne déplace pas le pointeur du système.

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
pincement conserve sa mesure 2D relative à la taille de la paume. Ces heuristiques
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
Vue ni DOM. `createHandPointerTracker().update(trackingFrame, poses)` produit les
positions normalisées des index, leur posture, leur état actif et la main principale.
Seul un pointage confirmé dans l'image active le pointeur. Le lissage est isolé
par identité et réinitialisé après un repos ou une absence ; une image déjà
traitée n'est pas filtrée une seconde fois.

La première main en pointage devient principale et garde ce rôle tant que son
identité existe. `setPrimaryHand(id)` permet un choix explicite ; `null` relance
le choix automatique. Une absence brève réserve le rôle sans afficher de curseur
pour la main manquante. Une identité perdue ou ambiguë libère le choix principal.

Le [Playground](apps/playground/README.md#diagnostics) affiche ces pointeurs dans
la vidéo. Les coordonnées **Source x/y** du panneau restent celles de l'image
avant miroir. Les règles décrites ici sont celles du diagnostic actuel ; les
états de contrôle du PC seront définis dans le moteur commun.

### Commandes PC et moteur commun — à construire

Le même moteur devra interpréter les gestes dans le Playground et dans
l'application PC. Seule l'exécution des commandes dépendra de l'environnement :

```text
Observations → Interprétation commune → Commandes
                                          ├── Simulation dans le Playground
                                          └── Exécution sur le PC
```

La simulation permettra de diagnostiquer les commandes effectivement produites.
L'exécuteur système devra être validé sur le système cible, notamment pour le
fonctionnement en arrière-plan, les entrées maintenues et la destination de la
saisie. Ces fonctionnalités ne sont pas encore présentes.

Windows est la première cible proposée. La technologie bureau et la machine
sur laquelle les entrées système seront vérifiées restent à confirmer avant
le développement de l'application locale. Le [cadrage](docs/architecture.md)
et la [roadmap](docs/roadmap.md) détaillent ces décisions.

### Sessions de suivi communes

Le Playground utilise `createTrackingSession` dans `@handfinity/vision`.
Chaque instance possède sa caméra, son détecteur, sa boucle vidéo et son suivi
d'identités. `start(video)` initialise le suivi ; `stop()` est disponible dès la
création de la session, y compris pendant un démarrage en attente. Une même
instance peut être arrêtée puis redémarrée.

Le callback `onFrame` reçoit les observations, le suivi des identités, le ratio
d'image et `hasNewFrame`. Ce dernier distingue une nouvelle image d'une simple
avancée du temps : l'expiration du suivi continue sans rejouer la détection.
`onError` signale une erreur de la boucle après nettoyage ; les erreurs
d'initialisation rejettent la promesse de `start`.

Quitter le laboratoire arrête sa session. Un arrêt libère immédiatement les
ressources disponibles ; un flux ou détecteur reçu ensuite est libéré à son
arrivée, sans relancer le suivi ni modifier la session suivante. Le composant du
Playground assemble encore les postures, les pointeurs et le rendu ; cette
orchestration est le prochain refactoring prévu.

### Lancement et distribution des applications

#### En développement :
```bash
# Accueil : http://localhost:3000 ; laboratoire : /playground
npm run dev

# Facultatif : laboratoire autonome sur http://localhost:3002
npm run dev -w playground
```
Le hub donne accès aux deux pages. Docker Compose permet également de lancer
leurs services de développement.

#### En production (Build statique des applications) :
```bash
npm run build
```
La commande compile les interfaces Vue avec Vite :

- **Hub** : `apps/hub/dist/`, contenant l'accueil et le laboratoire intégré.
- **Playground** : `apps/playground/dist/`, pour le laboratoire autonome.
- **Distribution web** : Fichiers statiques pouvant être servis par Nginx derrière un hébergement HTTPS.

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
- [ ] **Moteur commun et premier contrôle du PC — étapes 6 à 10**
  - [ ] Centralisation de l'interprétation et commandes de pointeur partagées
  - [ ] Application bureau, suivi en arrière-plan et véritable curseur
- [ ] **Souris utilisable — étapes 11 à 18**
  - [ ] Pause, reprise, choix de main et calibration
  - [ ] Clic principal, déplacement avec maintien, clic secondaire et défilement
  - [ ] Conservation des réglages
- [ ] **Clavier à la demande — étapes 19 à 24**
  - [ ] Clavier superposé, invocation gestuelle et sélection des touches
  - [ ] Saisie dans l'application destinataire, édition et raccourcis
- [ ] **Validation et distribution — étapes 25 à 27**
  - [ ] Parcours complets, vérifications Windows et application distribuable
- [ ] **Perspectives ultérieures**
  - [ ] Étude d'une intégration smartphone
  - [ ] Étude des lunettes de réalité augmentée selon le matériel retenu

Les étapes de recadrage 1 à 5 ont été livrées ensemble dans **un seul commit,
`7f6d27b`** ; elles ne correspondent pas à cinq commits distincts. La suite suit
le [découpage détaillé](docs/roadmap.md), un petit lot à la fois, avec tests et
validation utilisateur.

---

## Utiliser Handfinity

1. **Ouvrir le laboratoire** : depuis l'accueil, accéder à **Playground**. La caméra reste arrêtée jusqu'à l'action **Start camera** et l'autorisation du navigateur.
2. **Observer le suivi** : présenter une ou deux mains séparées pour lire leurs numéros, états et postures dans les diagnostics.
3. **Activer un pointeur** : tendre l'index, replier majeur, annulaire et auriculaire et séparer le pouce de l'index. Un cercle apparaît dans la vidéo ; son contour plein désigne la main principale.
4. **Choisir et arrêter** : utiliser **Main hand** pour changer de main principale et **Stop camera** pour libérer la session. Quitter le laboratoire coupe également la caméra.

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
local et le futur contrôle des entrées du PC, qui nécessitera une application
locale adaptée au système choisi.

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
web ne remplace pas l'application bureau prévue dans la roadmap.

---

## 🛠️ Scripts Disponibles

| Commande | Description |
| :--- | :--- |
| `npm run dev` | Démarre l'accueil et le laboratoire intégré sur le port 3000 |
| `npm run dev -w playground` | Démarre le laboratoire autonome sur le port 3002 |
| `npm run build` | Compile le Playground autonome puis le hub intégré |
| `npm run lint` | Exécute le linter Biome |
| `npm run format` | Formate le code avec Biome |
| `npm run format:check` | Vérifie le formatage sans modifier les fichiers |
| `npm run check` | Lance `biome check .` |
| `npm test -w @handfinity/core` | Exécute les tests unitaires du core |
| `npm test` | Exécute les tests du core, des pointeurs, de la vision et des transitions du hub |
| `docker compose up --build hub` | Démarre l'accueil et le laboratoire intégré dans Docker |
| `docker compose up --build playground` | Démarre le laboratoire autonome dans Docker |

Les commandes `npm test`, `npm run lint`, `npm run format:check` et `npm run build`
constituent les vérifications utilisées en CI. Les essais webcam et, à terme,
les essais sur le système PC cible complètent les tests automatisés.

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

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
| Pause et reprise volontaires | `packages/interactions/src/gesture-control.ts` | Moteur commun et diagnostics partagés |
| Orchestration postures → pointeurs | `packages/interactions/src/gesture-engine.ts` | Playground |
| Commandes de déplacement | `packages/interactions/src/pointer-commands.ts` et moteur commun | Simulation du Playground |
| Exécution simulée et journal | `apps/playground/src/pointer-simulation.ts` | Diagnostics des commandes |
| Fenêtre Electron, origine locale et permissions | `apps/desktop/src/main.ts` | Application bureau |
| Contrat, preload et validation IPC du pointeur | `apps/desktop/src/pointer-contract.ts`, `preload.cts` et `pointer-ipc.ts` | Interface bureau et main Electron |
| Activation, suspension et exécution des déplacements | `apps/desktop/src/pointer-controller.ts` | Processus principal Electron |
| Politique de performance du renderer Windows | `apps/desktop/src/windows-tracking-performance.ts` | Préparation par le main, sans accès renderer natif |
| Appels natifs Windows du curseur | `apps/desktop/src/windows-pointer.ts` | Contrôleur du pointeur bureau |
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
  Son ratio utilise la distance pouce/index et la taille de paume dans le même
  repère XYZ estimé, corrigé du ratio vidéo ; une superposition en projection
  seule ne suffit plus à déclencher un pincement.
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
- `SystemPointerBridge` : capacités fixes de consultation, activation, arrêt,
  transmission d'une commande et abonnement aux états du contrôle Windows.
  `PointerUpdate` transporte le numéro de session d'activation, l'instant de
  capture, le booléen `paused` et une commande `pointer:move`, ou `null` pour suspendre l’exécution.
- `NativePointer` : démarrage du helper, déplacement en pixels physiques avec
  une date d'expiration, puis arrêt. Le résultat confirme l'appel Win32 réel ;
  une commande expirée retourne `false`.

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
`update(trackingFrame, aspectRatio)` et retourne `{ tracking, poses, pointers, control, commands }`.
Il orchestre les trackers existants dans cet ordre, transmet le choix principal
via `setPrimaryHand(id)` et regroupe leur remise à zéro dans `reset()`.
Il dépend de `core`, sans dépendre de `vision`, de Vue ou du DOM.

`gesture-control.ts` consomme les postures reconnues et le numéro principal déjà
choisi. Une paume ouverte confirmée et candidate pendant 1 500 ms de nouvelles
observations bascule `control.paused`. Le temps d’une image rejouée ne confirme
rien ; perte, ambiguïté, changement de main ou de candidate annulent un maintien
incomplet. Seule la principale est éligible, ou une main unique si aucune
principale n’existe. L’absence d’une principale ne réserve pas une nouvelle
identité : la sélection explicite du contrôle reste l’étape 12.

Après un basculement, `requiresRelease` reste vrai jusqu’à un pointage ou
pincement confirmé, ou quatre doigts nettement repliés. Une posture incertaine
ne réarme pas le geste, même avec une nouvelle identité. Une perte ou une ambiguïté ne le retire pas. La pause reste globale
au moteur après perte d’identité et bloque la production des commandes, tandis
que les pointeurs de diagnostic restent suivis. `holdProgress` et `handId`
alimentent uniquement l’affichage du maintien. `reset()` retire pause et maintien ;
un changement explicite de principale annule le maintien, sans retirer la pause.

L'interface bureau dans `apps/desktop/src/renderer/App.vue` importe
`playground/view` et ajoute ses contrôles via un slot. La vue partagée transmet
chaque résultat du moteur avec `gesture-frame` et signale son arrêt avec
`tracking-stop`. Elle réutilise les mêmes packages `core`, `vision` et
`interactions`, ainsi que l'exécuteur de simulation. Le processus principal
Electron crée la fenêtre et sert les fichiers compilés depuis
`handfinity://app/` ; il exécute les commandes sans reconnaître de geste.

Cette page locale est le seul contexte autorisé à demander la caméra vidéo,
dans la fenêtre principale. Le microphone, la capture d'écran, les navigations
et les nouvelles fenêtres sont refusés. Le renderer utilise l'isolation de
contexte et le sandbox, sans intégration Node.js. Le preload CommonJS expose
une API fixe avec `contextBridge`, sans accès générique à `ipcRenderer`.
Chaque message est limité à la frame principale de la fenêtre locale, avec
validation de son origine et de ses données dans le main. Le confinement des
fichiers et les permissions restent testés séparément.

Le Playground consomme chaque résultat de la session, y compris sans nouvelle
image pour traiter les expirations. Les trackers dédupliquent les observations
avec leur horodatage ; le moteur n'ajoute aucune confirmation ni aucun lissage
sur une image répétée. Vue conserve le rendu et les diagnostics et réinitialise
le moteur à l'arrêt. Les commandes de déplacement sont émises uniquement pour
une nouvelle observation de la main principale en pointage confirmé, une fois
par image. Une image répétée ou un diagnostic conservé jusqu'à l'expiration
ne produit aucune nouvelle commande.

La destination de `pointer:move` utilise la position déjà lissée :
`x = 1 - pointer.position.x`, `y = pointer.position.y`, entre 0 et 1.
`createPointerSimulation` consomme ces commandes sans réinterprétation ni
second miroir. Il conserve la dernière position sans commande, borne son
journal à huit entrées, compte les commandes reçues et efface ces états à
l'arrêt. Le navigateur conserve uniquement cette simulation.

L'étape 10 ajoute un exécuteur de déplacement Windows après une activation
explicite **Enable Windows pointer**, disponible après **Start camera**. Le main
porte les états `disabled`, `starting`, `waiting`, `moving`, `paused`, `error` et
`unsupported`. Chaque activation possède un numéro de session ; les messages
d'une activation précédente sont ignorés. **Stop Windows pointer** et le
raccourci global **Ctrl + Alt + Esc** désactivent le contrôle. Le raccourci
est réservé pendant le démarrage et l'activation, puis libéré à l'arrêt ;
un échec d'enregistrement empêche l'activation.

La destination vise l'écran principal Windows entier, avec ses limites
converties de DIP en pixels physiques par
`screen.dipToScreenRect(null, screen.getPrimaryDisplay().bounds)`. Le calcul
utilise `x = bounds.x + round(position.x * (bounds.width - 1))`, et de même
pour `y`, sans second miroir. Le helper PowerShell persistant reçoit uniquement
des données JSON et appelle `SetPhysicalCursorPos`. Il confirme le résultat
de chaque appel ; aucun processus n'est lancé par image et aucune politique
de sécurité n'est désactivée.

Le contrôleur conserve au plus une commande en cours et la destination la plus
récente en attente. Il interpole des positions physiques entre la dernière
position confirmée et la cible, sans extrapolation ni reconnaissance supplémentaire.
La durée du trajet suit l'intervalle entre les mesures, borné entre `1000 / 60` ms
et 100 ms. Une nouvelle cible remplace le trajet précédent. Après activation ou
suspension, le premier point est appliqué directement ; aucune ancienne position
de main n'est réutilisée comme départ.

Le timer de présentation reste actif uniquement pendant un trajet. Son intervalle
demandé est de `1000 / 120` ms, mais une mesure Node Windows a montré des réveils
espacés d'environ 15,6 ms, soit environ 64 Hz. Ni 120 Hz ni 244 Hz ne sont garantis.
La cadence des positions du curseur est distincte de celle des observations,
qui reste limitée par la caméra et l'inférence CPU. L'interpolation ne crée
aucune nouvelle observation.

Une comparaison native Windows sur 30 cibles synthétiques en environ 3,4 secondes
passe de 30 à 195 positions distinctes, dont 180 intermédiaires : environ 9 puis
57 positions par seconde. La médiane entre sorties est de 15,6 ms et le p95 de
30,8 ms ; cette mesure n'est pas une garantie de cadence ni un essai webcam.

Le wrapper bureau ne transmet rien lorsque le moteur ne produit pas de commande
sur une image répétée avec un pointeur principal encore actif. Ce silence
ne rafraîchit pas le watchdog. Le repos, la perte d'une main, une ambiguïté ou
l'expiration du suivi transmettent toujours `null` : le contrôleur supprime la
destination en attente et le trajet, puis immobilise le curseur. Un watchdog
suspend aussi l'exécution après 250 ms sans commande fraîche ; l'interpolation
ne prolonge pas cette durée et le helper abandonne les commandes expirées.
Une nouvelle commande valide permet la reprise tant que le contrôle reste activé
et que la pause volontaire n’est pas active.

À l’étape 11, le wrapper transmet aussi `paused`, y compris sur les images sans
nouveau déplacement. Le main conserve `paused` avec le numéro de session ;
les appels tardifs et les timers ne le font pas revenir à `moving`. Les reprises
périmées, d’une autre session ou mal formées ne retirent pas la pause. Le main
exécute l’état décidé par le moteur ; il ne reconnaît aucun geste. Une reprise
valide passe à `waiting` puis attend une commande fraîche. Le helper persistant
et le raccourci global restent disponibles pendant la pause.

L'arrêt caméra, le rechargement de la page, la perte du renderer et la fermeture
désactivent le contrôle et terminent le helper. Un changement d'application ou
une réduction conserve l'activation. Cette étape livre uniquement le
déplacement et la pause/reprise volontaire de l’étape 11 ;
la calibration de la zone des mains à l'étape 13, puis les boutons, le défilement
et le clavier aux étapes suivantes.

L'étape 9 règle `backgroundThrottling: false` dès la création de la fenêtre
Electron pour désactiver la limitation des timers en arrière-plan. Ce réglage
seul n'a pas suffi : lors de l'essai Windows réduit, la boucle d'animation
ne traitait qu'environ une image par seconde.

Le main ajoute également `disable-renderer-backgrounding` avant le démarrage
d’Electron : la vision doit conserver sa priorité quand la fenêtre est réduite.
Ce réglage est distinct de la limitation des timers
([documentation Electron](https://www.electronjs.org/docs/latest/api/command-line-switches#--disable-renderer-backgrounding)).
Ce seul flag n’a pas supprimé le ralentissement mesuré. Avant le premier affichage,
le main lance donc un programme PowerShell statique ponctuel, avec le PID renderer
obtenu par `webContents.getOSProcessId()`. `GetProcessInformation` puis
`SetProcessInformation(ProcessPowerThrottling)` désactivent explicitement
`PROCESS_POWER_THROTTLING_EXECUTION_SPEED` pour ce processus, en préservant les
autres bits ; une seconde lecture confirme le résultat. Ce réglage HighQoS de
gestion d’énergie conserve la classe de priorité CPU
([documentation Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-setprocessinformation)).
Le helper ferme le handle puis quitte ; le renderer conserve cette politique
jusqu’à sa sortie. Le main mémorise le PID préparé, partage une préparation en
cours et reprend si le PID change lors d’un rechargement. Une erreur d’un ancien
renderer ne fait pas échouer son remplaçant. La fermeture annule la préparation.
Aucun PID n’est accepté par IPC et les protections Electron restent en place.
Les délais de perte de suivi et de fraîcheur des commandes restent inchangés.

Le renderer bureau transmet donc `trackingOptions: { scheduling: "timer" }`
à la vue partagée. Celle-ci appelle `createTrackingSession` avec ces options :
`scheduling: "timer"` réarme `window.setTimeout` après chaque traitement, avec
un budget de `1000 / 30` ms incluant la vision, le moteur et le rendu. Chaque tick
est horodaté avec `performance.now()` ; le délai suivant vaut
`max(0, 1000 / 30 - temps écoulé depuis le début du tick)`. Il n'y a ni rattrapage
des retards ni traitements concurrents. La cadence visée est de 30 itérations
par seconde, sans garantie. Ce budget corrige, au sein de l'étape 10, le délai
fixe de 33,3 ms ajouté après le traitement dans la version de l'étape 9.
La boucle reste indépendante de `requestAnimationFrame`. Sans option, la
session web conserve sa cadence par frames d'animation.

La session conserve sa vidéo HTML, une seule boucle et son unique suivi
d'identités ; la vue alimente toujours le même moteur commun. L'arrêt annule
le callback avec `clearTimeout` ou
`cancelAnimationFrame` selon la cadence choisie, puis libère les ressources.
Les protections du renderer et les permissions sont conservées. Le pont IPC
ajouté à l'étape 10 transporte les commandes de ce même moteur.

La déduplication utilise `getVideoPlaybackQuality().totalVideoFrames` lorsque
cette API fournit une première valeur positive. L’horloge `currentTime` seule peut avancer sur un flux
live sans nouvelle image. La session utilise encore cette horloge en repli si
l’API de qualité est absente ou reste nulle depuis le démarrage, ce qui préserve
les flux Firefox. Après une valeur positive, le compteur reste autoritaire même
s’il revient à zéro : le gel de la source ne réactive pas le repli. Une vidéo en pause ne produit aucune nouvelle
observation. Le compteur indique des frames affichées ou abandonnées par le
navigateur ; il ne mesure pas toutes les captures physiques de la webcam.

Le diagnostic **Images processed** augmente uniquement lorsqu'une nouvelle image
a été traitée par la vision puis le moteur, y compris lorsqu'aucune main n'est
détectée. Une itération sans nouvelle image ne l'incrémente pas. Il revient à
zéro à l'arrêt. Le compteur de commandes ne suffit pas à observer la continuité :
une image valide sans pointage ne produit aucun déplacement.

Les essais natifs Windows avec caméra simulée ont vérifié la continuité :
388 images traitées pendant 30 secondes de réduction, avec progression des
images décodées et changement des pixels vidéo. L'arrêt, la reprise et la
fermeture du processus ont aussi été vérifiés. Le parcours avec une vraie
webcam, dont la perte et le retour d'une main, a ensuite été validé par
l'utilisateur. L'étape 9 est commitée et poussée dans `9804677`.
Avec ce réglage Electron, `visibilityState` reste
`visible` même lorsque la fenêtre est réduite : les essais doivent vérifier son
état Windows réel et la progression des images traitées. La réduction conserve
le suivi ; **Stop camera** libère les ressources et la fermeture quitte
l'application.

Avant la correction de fluidité de l'étape 10, 310 tests passaient et un scénario
natif Windows avec caméra simulée et commandes synthétiques a confirmé le déplacement physique du curseur sur
l'écran principal, y compris hors focus et fenêtre réduite. Le raccourci global,
l'arrêt caméra, le rechargement et la fermeture avec libération du helper ont
été vérifiés, sans erreur JavaScript interceptée. Le parcours avec les vrais
gestes et son confort restent à valider avec la webcam. L'installeur de
distribution reste prévu à l'étape 27.

Une mesure isolée du helper persistant a donné un délai de confirmation au
95e percentile de 0,48 ms ; il n'était pas le goulot observé dans cet essai.
Les 336 tests de la correction passent, ainsi que lint, formatage et builds
web/bureau. Les arrêts ont été revérifiés dans Electron Windows. Le parcours
webcam doit encore éprouver les mouvements lents, les courbes, les
arrêts et la reprise, y compris fenêtre réduite.

Le retour utilisateur confirme une amélioration au premier plan, mais les
coupures en réduction ont demandé les corrections de politique Windows et de
déduplication. Un profilage séparé a mesuré le ralentissement du calcul, alors
que la capture continuait à 20 images/s. Après correction intégrée, un essai
Windows de 30 secondes réduit traite environ 594 images, sans longue tâche de
plus de 50 ms ; deux retards entre traitements dépassent toutefois 120 ms
(maximum environ 175 ms). Les 390 tests passent, ainsi que les builds et contrôles
de qualité. Les seuils de suivi restent inchangés ; la régularité réelle avec
la webcam doit être retestée. Une rotation synthétique du pointage qui provoquait
un faux pincement conserve maintenant la pose et les commandes ; cela ne prouve
pas que toutes les pertes de pose devant le torse venaient de ce calcul.

Les règles d'interprétation doivent être partagées : seuils, confirmations,
choix de main, activation, pause, gestes et transitions. Une interface ne doit
pas ajouter sa propre détection du pincement ou une autre interprétation du
même geste. Les commandes seront introduites au rythme de leurs consommateurs
réels : déplacement, boutons, défilement puis clavier.

La simulation affiche les commandes de déplacement et leurs effets. L'exécuteur
Windows les traduit en positions du curseur. Le choix d'un champ de texte ou d'un bouton du
logiciel utilisé appartiendra au fonctionnement normal de ce logiciel.

Les tests utilisent des observations horodatées et des réglages identiques
pour vérifier la production des commandes. La simulation ne remplace pas la
validation de leur exécution réelle sur le système cible.

L’utilisateur a validé l’étape 10 dans `a2449a7` et demandé de reporter les
améliorations restantes de fluidité. L’étape 11 utilise un maintien de 1,5 seconde
choisi par l’utilisateur. Ses **421 tests** et les builds/contrôles de qualité
passent ; le navigateur et Electron Windows ont vérifié les parcours synthétiques
de pause/reprise et d’arrêt. La reconnaissance réelle de ce geste reste à valider.

## Points à décider ou à éprouver

1. Validation webcam du geste de pause/reprise de l’étape 11 : maintien de
   1,5 seconde, relâchement et reprise volontaire. Le déplacement de l’étape 10
   a été accepté ; son confort reste perfectible, avec itérations reportées.
2. Maintien de ce contrôle dans une autre application ou fenêtre réduite,
   suspension sur perte de suivi, puis reprise. L'étape 9 a validé le suivi
   vidéo en arrière-plan et le scénario synthétique couvre le curseur ;
   la nouvelle pause doit être éprouvée avec les vrais gestes.
3. Correspondance entre la zone de mouvement des mains et l'écran, miroir,
   sensibilité et calibration.
4. Gestes volontaires d’activation, de clic secondaire, de défilement
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

L'application PC conserve les diagnostics et la simulation du Playground, avec
un exécuteur de déplacement Windows activable séparément. Les clics, le
défilement, la saisie clavier, le contrôle Linux, l'intégration Android,
l'interface AR et une bibliothèque publiée restent ultérieurs.

Un hébergement du site sur VPS ou PC Ubuntu fournit les fichiers web au
navigateur. Il ne déplace pas automatiquement la reconnaissance vers cet
hébergement. Dans le bureau, l'application Electron exécute la vision et le
moteur localement. Un calcul distant demanderait une acquisition et un transport
distincts, qui ne font pas partie du bootstrap.

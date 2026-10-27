# Handfinity — Desktop

Cette application Electron 45.0.0 ouvre une fenêtre **Handfinity Desktop** sur
Windows 11 x64. Elle réutilise `playground/view` : même caméra, mêmes diagnostics,
même moteur et même simulation. Le curseur simulé suit le bout de l'index de la
main principale lorsque le pointage est confirmé.

L'étape 9, validée par l'utilisateur avec sa vraie webcam et livrée dans
`9804677`, conserve le suivi en arrière-plan. L'étape 10 ajoute le déplacement
du **vrai curseur Windows**, sur activation explicite après **Start camera**.
Une première version a été vérifiée sous Windows avec des commandes synthétiques.
L’utilisateur a validé et commité ce lot dans `a2449a7`, en reportant les
itérations restantes de fluidité. L’étape 11 ajoute la pause et la reprise
volontaires par paume ouverte maintenue **1,5 seconde**, validées dans `66efba1`.
L’étape 12 et son sélecteur ont été commités dans `1785d6c`. À la demande de
l’utilisateur, la main qui pointe est désormais choisie automatiquement et
l’interface partagée a été réorganisée
pour rapprocher vidéo, simulation, état de la main et commande Windows.
Les détails de suivi et le journal restent accessibles dans des panneaux repliés.
La cause du blocage n’est pas encore identifiée ; un nouvel essai webcam est
nécessaire. Le moteur choisit désormais la main de contrôle automatiquement.
Les clics, le défilement et le clavier appartiennent aux étapes suivantes ;
l'installeur de distribution reste prévu à l'étape 27.

## Responsabilités

- **Electron** crée la fenêtre et sert les fichiers compilés depuis
  `handfinity://app/`. Le processus de fenêtre est isolé, sans accès direct à
  Node.js. La page locale de l'application peut demander la caméra vidéo ; les
  autres permissions sont refusées. `backgroundThrottling: false` est réglé dès
  la création de la fenêtre pour désactiver la limitation des timers en
  arrière-plan. Un preload sandboxé expose les seules capacités nécessaires au
  pointeur ; le main valide la fenêtre, la frame principale, l'origine locale
  et les données de chaque échange IPC.
- **La vue partagée du Playground** utilise `core`, `vision` et `interactions`
  pour analyser les images et simuler les commandes. Aucune reconnaissance des
  gestes n'est recopiée dans le code bureau. Le renderer bureau configure
  `trackingOptions: { scheduling: "timer" }` ; le navigateur conserve
  `requestAnimationFrame` par défaut. La session de vision possède toujours
  une seule boucle et un seul suivi d'identités.
- **L'interface bureau** reçoit les résultats du moteur via les événements de
  la vue partagée et ajoute les commandes **Enable Windows pointer** et
  **Stop Windows pointer**. Elle transmet les commandes existantes au main,
  sans interpréter de nouveau les gestes.
- **L'exécuteur Windows** transforme la destination normalisée en pixels
  physiques de l'écran principal. Un helper PowerShell persistant appelle
  `SetPhysicalCursorPos` et confirme chaque déplacement exécuté. Le même
  processus traite les commandes successives ; aucun processus n'est créé
  pour chaque image et aucune politique de sécurité n'est désactivée.
- **Le lanceur** utilise Electron Windows quand la commande part de WSL2.
  WSL2 compile le projet ; la caméra et les calculs fonctionnent dans la fenêtre
  Electron exécutée sur Windows.

Le suivi bureau utilise `window.setTimeout` avec un budget de `1000 / 30` ms
incluant la vision, le moteur et le rendu. Après chaque traitement, il attend
uniquement le temps restant, borné à zéro, sans rattraper les retards. La cadence
visée reste de 30 itérations par seconde, sans garantie : caméra et inférence CPU
limitent le nombre d'images nouvelles réellement traitées. Cette boucle reste
indépendante des frames d'animation, qui descendaient à environ une par seconde
dans l'essai Windows réduit malgré `backgroundThrottling: false`.
**Stop camera** annule le timer puis libère les ressources.

Pour éviter de déplacer le curseur uniquement à l'arrivée de chaque mesure,
le main produit des positions physiques intermédiaires jusqu'à la dernière cible
reçue, sans prédire le mouvement de la main. La durée s'adapte à l'intervalle
entre mesures, entre 16,7 et 100 ms. Le premier point après activation ou perte
est appliqué directement, sans reprendre une ancienne trajectoire. Le timer de
déplacement ne tourne que pendant un trajet.

La cadence demandée pour ces positions est de 120 Hz. Une mesure Node Windows
a toutefois donné des réveils espacés d'environ 15,6 ms, soit environ 64 Hz :
ni 120 Hz ni la fréquence de l'écran ne sont garantis. Cette cadence de curseur
est distincte de celle des images et ne crée aucune nouvelle observation caméra.

Le contrôle Windows reste désactivé au lancement. Après **Start camera**,
cliquer sur **Enable Windows pointer**. Le statut passe de démarrage à attente d'une
main en pointage, puis au suivi de la main principale. **Stop Windows pointer**
ou **Ctrl + Alt + Esc** désactive le contrôle tout en gardant la caméra active.
Ce raccourci est enregistré pendant le démarrage du contrôle et son activation,
puis libéré à l'arrêt. Si son enregistrement échoue, le contrôle reste arrêté.

Le panneau **Gesture control** affiche l’état commun au Playground et au PC.
Maintenir la paume ouverte confirmée pendant **1,5 seconde** met le moteur en
pause et le main dans l’état `paused`. La caméra et les diagnostics restent
actifs ; repointer ou perdre la main ne reprend pas les déplacements. Replier
les doigts ou repointer brièvement, puis refaire le maintien permet de reprendre.
La main de contrôle effectue ce geste ; une main seule visible peut aussi être choisie automatiquement au repos.
Garder la paume ouverte ne produit qu’un basculement jusqu’à des doigts
nettement repliés ou une autre posture confirmée, même après une disparition. Un maintien interrompu repart de zéro.

`PointerUpdate.paused` transmet cet état sans recopier de reconnaissance dans
le bureau. Le main valide ce booléen et la commande avant de changer d’état,
efface la cible, le trajet et les timers à la pause, et conserve la même session
et son raccourci d’arrêt. Une reprise n’envoie aucune ancienne destination.
Un appel natif déjà engagé peut se terminer ; il ne relance pas le trajet.
**Ctrl + Alt + Esc** et **Stop Windows pointer** désactivent aussi un contrôle
en pause ; un geste ne les réactive pas. **Stop camera** remet la pause commune
à zéro et exige de nouveau le bouton Windows après redémarrage de la caméra.

L'écran visé est **l'écran principal Windows entier**, barre des tâches comprise.
Le main convertit ses dimensions DIP en pixels physiques avant d'appliquer les
coordonnées normalisées, sans ajouter de miroir. La calibration de la zone des
mains, la sensibilité et le choix d'écran ne sont pas ajoutés à ce lot ; la
calibration est prévue à l'étape 13.

Une main au repos, absente ou ambiguë suspend les nouvelles commandes et efface
la destination en attente ainsi que le trajet. Une image répétée avec un pointeur
principal encore actif ne transmet aucun message et ne suspend pas le trajet ;
elle ne rafraîchit pas non plus le watchdog. Une absence de commande fraîche
pendant 250 ms suspend l'exécution. Une seule commande peut être en cours, avec
au plus une destination plus récente en attente ; les commandes expirées sont
abandonnées. **Stop camera**, un rechargement, un crash du renderer ou la
fermeture désactive le contrôle et termine le helper. Perdre le focus ou réduire
la fenêtre conserve le suivi et le contrôle activé.

Un futur PC Ubuntu utilisera une version Linux issue du même projet, avec une
adaptation de l'exécuteur système. Son contrôle n'est pas livré ici. Un VPS
peut héberger le site et les téléchargements indépendamment de l'application
installée sur le PC. Le futur contrôle d'Android par caméra frontale demandera
une intégration native spécifique et une étude distincte.

La main en pointage prend automatiquement le contrôle, même si l’autre main
reste visible. Lorsque les deux pointent, la main active conserve le rôle ;
si elle ne pointe plus, une autre main en pointage peut prendre le relais.
Après perte ou ambiguïté, une nouvelle observation confirmée reprend le contrôle
sans sélection manuelle. La nouvelle identité ne garantit pas qu’il s’agit de la
même main physique. Le main évite d’interpoler entre deux identités et conserve
la pause acquise. **Stop camera** réinitialise le moteur et arrête le contrôle.

## Démarrer depuis WSL2

Prérequis : Windows 11 x64, Node.js 24 et npm dans WSL2, l'interopérabilité
Windows de WSL activée et `unzip` disponible dans la distribution Linux.
Windows doit autoriser la caméra pour les applications de bureau. L'adaptateur
du curseur utilise Windows PowerShell et User32 sur le poste Windows.

Depuis la racine du dépôt :

```bash
npm ci
npm run dev:desktop
```

La commande compile le processus principal et l'interface, puis ouvre
**l'application Windows**. Il ne s'agit pas d'une fenêtre Linux via WSLg.
Aucun second clone du dépôt côté Windows n'est nécessaire pour ce lancement.

Au premier lancement, le script télécharge Electron Windows. L'archive est
conservée dans le cache ignoré `apps/desktop/node_modules/.cache/`, puis extraite
dans `%LOCALAPPDATA%\Handfinity\Cache\electron-45.0.0-x64` sur le disque Windows.
Ce placement permet de garder les protections d'Electron actives ; le projet
et ses fichiers compilés restent dans WSL2. L'installation `npm ci`
ne télécharge pas ce binaire à l'avance. Le suivi charge aussi les fichiers
MediaPipe depuis jsDelivr et le modèle depuis Google Storage : ces ressources
ne sont pas embarquées pour un fonctionnement hors connexion.

Il n'y a pas de rechargement automatique à cette étape. Après une modification,
fermer la fenêtre puis relancer `npm run dev:desktop`.

Pour séparer compilation et lancement :

```bash
npm run build:desktop
npm run start:desktop
```

Le premier compile ; le second ouvre le dernier build existant. Le lancement
de développement utilise déjà un processus Windows Electron, mais ne produit
pas encore d'installeur `.exe` à distribuer.

## Autres environnements

Pour développer directement sous Windows avec PowerShell, utiliser un checkout
Windows et y exécuter `npm ci` avec Node.js 24 Windows, puis les mêmes commandes.
Conserver ses dépendances séparées de celles installées sous WSL2.

Hors WSL2, le lanceur utilise le binaire Electron correspondant à la plateforme
courante. Un lancement Linux ne valide pas le comportement Windows ; les
adaptations de contrôle Linux restent ultérieures. L'interface y indique que
le contrôle système demande Windows ; caméra et simulation restent utilisables.

## Vérifications automatiques

```bash
npm test
npm run lint
npm run format:check
npm run build
npm run build:desktop
```

Les tests bureau vérifient l'origine locale, le confinement des fichiers,
les permissions vidéo, le réglage initial d'arrière-plan et la fermeture.
Les protections du renderer et les refus de navigation restent couverts.
Les tests de session couvrent les mêmes parcours avec les deux cadences :
déduplication, expiration, perte et retour de main, arrêt et redémarrage,
ressources retardées et callbacks obsolètes. Les tests du moteur et de la
simulation restent partagés.
Le lancement natif Windows depuis WSL2, le chargement de MediaPipe, les cycles
caméra et la fermeture pendant le suivi ont aussi été vérifiés avec une caméra
simulée à l'étape 8.

À l'étape 9, **225 tests passent**, ainsi que lint, formatage et builds web et
bureau. Un scénario natif Windows avec caméra simulée a vérifié le traitement
pendant la perte de focus, la réduction et la restauration : **388 images
traitées sur 30 secondes de réduction**, avec progression des images décodées
et changement des pixels vidéo. Les prélèvements toutes les deux secondes
confirment la continuité pendant cet intervalle. Une source mise en pause
n'augmente plus le compteur ; la reprise, l'arrêt, le redémarrage puis la
fermeture du processus Windows passent aussi, sans erreur JavaScript interceptée.
Ces mesures ne garantissent aucune cadence avec un autre matériel. L'utilisateur
a ensuite validé les essais de l'étape 9 avec sa vraie webcam, puis commité et
poussé `9804677`.

La première validation de l'étape 10, avant la correction de fluidité, couvrait
**310 tests**, lint, formatage et builds web/bureau. Les tests couvrent le contrat
IPC et son origine, le preload, l'activation et l'arrêt, la conversion des
coordonnées, les commandes anciennes,
la suspension, la file bornée et le cycle de vie du helper. La vérification de
la correction ajoute le budget de traitement, les images répétées et les trajets
intermédiaires. Après correction, **336 tests passent**, ainsi que lint,
formatage et builds web/bureau.

Une comparaison du contrôleur avec le vrai exécuteur Windows utilise 30 cibles
synthétiques en environ 3,4 secondes : 30 positions distinctes avant correction,
195 après, dont 180 intermédiaires. Cela correspond à environ 9 puis 57 positions
distinctes par seconde. Après correction, l'intervalle médian est de 15,6 ms et
le p95 de 30,8 ms ; cette mesure ne prouve pas une sortie uniforme à 120 ou 244 Hz.
La suspension et la désactivation sont aussi vérifiées, avec restauration de la
position initiale du curseur. Le scénario Electron a revérifié les déplacements
hors focus et fenêtre réduite, le raccourci global, l'arrêt caméra, le
rechargement et la fermeture, sans erreur JavaScript interceptée.

Avant cette correction, un scénario natif Electron Windows, lancé depuis WSL2
avec caméra simulée et commandes synthétiques, a vérifié le déplacement réel sur un écran principal
de 5120 × 1440 pixels, y compris le coin `(5119, 1439)`, la perte de focus et la
réduction. L'activation explicite, le refus des paquets invalides ou périmés,
la suspension, l'arrêt global fenêtre réduite, l'arrêt caméra, le redémarrage,
le rechargement et la fermeture avec libération du helper passent également.
Aucune erreur JavaScript interceptée ; la position initiale du curseur a été
restaurée à la fin. Ces essais confirment l'exécution Windows et le pont IPC,
pas la précision ni le confort des vrais gestes : le parcours webcam ci-dessous
reste à valider.

Une mesure isolée du helper persistant a donné un délai de confirmation au
95e percentile de 0,48 ms : PowerShell n'était pas le goulot observé dans cet
essai. Cette mesure ne valide ni la cadence finale du curseur ni le parcours
avec la vraie webcam ; la comparaison des positions distinctes est décrite
ci-dessus et le confort reste à confirmer dans le parcours manuel.

Les retours suivants de l’utilisateur ont confirmé la fluidité au premier plan,
mais signalé des coupures fenêtre réduite et des pertes de pointage près du torse.
Le main prépare désormais le processus renderer Windows avant d’afficher la fenêtre.
Un programme PowerShell ponctuel applique `ProcessPowerThrottling` au seul PID
fourni par Electron, confirme le réglage puis quitte. Windows doit conserver la
vitesse d’exécution de ce processus même fenêtre réduite ; la classe de priorité
CPU reste inchangée. La politique dure jusqu’à la sortie de ce renderer et est
réappliquée si son PID change après rechargement. La fermeture annule une
préparation encore en cours. Le helper du curseur reste lancé uniquement à
l’activation explicite.

La session déduplique les traitements avec `totalVideoFrames` dès qu’une valeur
positive est disponible ; tant que ce compteur reste nul ou absent, elle conserve
le repli `currentTime` pour Firefox. Une fois le compteur utilisé, son gel provoque
l’expiration habituelle du suivi. Le pincement partage maintenant une mesure XYZ
du rapprochement des doigts et de la taille de paume : une simple superposition
2D lors d’une rotation ne suffit plus à arrêter le pointage.

Les régressions couvrent ces mesures, la compatibilité Firefox, la configuration
Windows et son cycle de vie. **390 tests passent**, ainsi que lint, formatage et
builds web/bureau. Dans la mesure Windows de 30 secondes fenêtre réduite avec
caméra simulée à 20 images/s, environ 594 images sont analysées. Les intervalles
entre traitements ont un p95 d’environ 87 ms ; deux retards dépassent 120 ms,
avec un maximum d’environ 175 ms. Avant la politique Windows, vingt retards
avaient dépassé 120 ms dans un relevé de même durée. Ces essais ciblent le
ralentissement de calcul ; ils ne garantissent pas l’absence de tout retard sur
un autre matériel et le confort webcam doit être confirmé par l’utilisateur.

À l’étape 11, **421 tests passent**, ainsi que lint, formatage et builds web/bureau.
Le navigateur a vérifié le parcours avec le vrai moteur et des observations
synthétiques : maintien court, progression, pause, pointage bloqué, perte,
reprise avec une main unique retrouvée, mouvement frais et remise à zéro.
Les captures aux largeurs 1440 et 390 px ont été inspectées, sans débordement ni
erreur JavaScript. Electron Windows a vérifié avec des paquets synthétiques la
pause persistante fenêtre réduite, le numéro de session conservé, le rejet des
reprises anciennes/étrangères, la reprise volontaire, le raccourci global pendant
la pause, le rechargement et la fermeture avec nettoyage. La reconnaissance du
geste avec la vraie webcam reste à valider.

## Vérifications manuelles

1. Lancer `npm run dev:desktop` depuis WSL2. **Start camera** est proposé,
   **Enable Windows pointer** est désactivé et la souris reste libre.
   **But :** vérifier que caméra et contrôle demandent une action explicite.
2. Cliquer sur **Start camera**, présenter une main et tendre l’index, replier les trois autres doigts
   et garder le pouce séparé : le cercle vidéo et la simulation doivent suivre
   la main, tandis que le vrai curseur reste utilisable avec la souris physique.
   Déplacer la main devant le torse puis sur les côtés, et tourner progressivement
   le poignet en gardant les doigts dans la même pose. **Hand poses** doit rester
   `Pointing` tant que l’index est tendu et les trois autres doigts repliés.
   Si le pointeur s’arrête, relever `Confirmed`, `Candidate` et les états des
   doigts : le squelette peut rester visible sans pointage reconnu.
   **Images processed** augmente, même sans main.
   **But :** vérifier le moteur partagé avant d'activer l'exécution Windows.
3. Ouvrir la main, puis cliquer sur **Enable Windows pointer** avec la souris
   physique. Attendre le statut d'attente, puis repointer et déplacer l'index.
   Le vrai curseur doit suivre le même sens que la simulation sur l'écran
   principal. Aucun clic ne doit être produit.
   Déplacer lentement l'index horizontalement, puis tracer des courbes régulières.
   Comparer les petits mouvements au comportement avant correction : observer
   les sauts, le retard et d'éventuelles oscillations, puis immobiliser l'index.
   Le curseur doit terminer son trajet et rester stable.
   **But :** vérifier l'activation, le miroir unique, la conversion en pixels
   et la fluidité des mouvements fins.
4. Passer dans Firefox ou un éditeur avec **Alt + Tab**, puis déplacer l'index.
   Répéter après réduction de Handfinity pendant 30 secondes. Le vrai curseur
   doit rester contrôlable, sans nouveau démarrage. Au retour, la vidéo et les
   diagnostics doivent être actuels et **Images processed** avoir progressé.
   Refaire les mouvements lents et les courbes pendant la réduction, sans
   interruption par salves. Un compteur total qui augmente ne suffit pas à
   prouver la régularité du curseur.
   **But :** vérifier la fluidité dans une autre application et en arrière-plan.
5. Ouvrir la main, puis la retirer du champ plusieurs secondes. Le curseur doit
   rester à sa dernière position, sans rattraper une ancienne trajectoire.
   Présenter de nouveau une main et repointer : les déplacements doivent reprendre
   automatiquement depuis une nouvelle mesure, sans rejoindre l’ancienne cible.
   **But :** vérifier suspension, expiration et reprise sans replay.
6. Cliquer sur **Stop Windows pointer**, puis repointer : le vrai curseur reste
   libre et la caméra continue. Réactiver le contrôle, passer dans une autre
   application et appuyer sur **Ctrl + Alt + Esc** : même résultat ; une nouvelle
   activation explicite est nécessaire pour reprendre.
   Répéter le raccourci pendant un mouvement, fenêtre Handfinity réduite : aucun
   trajet ne doit continuer après l'arrêt.
   **But :** vérifier les deux arrêts, dont celui accessible hors de la fenêtre.
7. Pendant le contrôle, cliquer sur **Stop camera** : la webcam se libère et le
   contrôle Windows s'arrête. Répéter trois cycles caméra ; chaque arrêt remet
   les compteurs à zéro et chaque nouveau démarrage demande de nouveau
   **Enable Windows pointer**.
   **But :** vérifier le nettoyage et l'absence de réactivation automatique.
8. Fermer la fenêtre pendant le contrôle, puis relancer l'application. La webcam
   doit se libérer et le contrôle rester arrêté au retour. Si la page est
   rechargée pendant le contrôle, une nouvelle activation doit aussi être requise.
   **But :** vérifier l'arrêt réel et l'abandon de l'ancienne session.
9. Arrêter la caméra bureau, puis ouvrir le Playground dans Firefox Windows.
   La caméra et la simulation doivent fonctionner ; les commandes Windows
   restent propres à l'application bureau.
   **But :** vérifier que le navigateur conserve son fonctionnement.

Avec ce réglage Electron, `document.visibilityState` reste `visible` même lorsque
la fenêtre est réduite : cette valeur ne prouve pas son état natif. Les essais
doivent réellement changer d'application ou réduire la fenêtre Windows.
Le compteur de commandes peut rester fixe pendant un suivi valide ; utiliser
**Images processed** pour observer le traitement des nouvelles images.

Pour l’étape 11, compléter ces essais :

- En contrôle actif, ouvrir brièvement la main puis repointer avant 1,5 seconde :
  le mouvement reprend sans pause persistante. Cela vérifie le délai choisi.
- Maintenir les cinq doigts ouverts pendant 1,5 seconde : **Gesture control** et
  **Windows pointer** indiquent la pause. Garder la paume ouverte, puis repointer
  ou retirer la main : les curseurs restent figés, la caméra continue. Répéter
  fenêtre réduite pour vérifier la persistance hors premier plan.
- Montrer un pointage ou replier les doigts brièvement, puis maintenir à nouveau
  la paume ouverte 1,5 seconde : le contrôle redevient prêt ; seul un nouveau
  pointage déplace les curseurs. Cela vérifie une reprise explicite sans replay.
- Pendant la pause, utiliser **Ctrl + Alt + Esc** : le contrôle Windows passe à
  `off`. Refaire le geste ne doit pas l’activer ; le bouton reste nécessaire.
  Cela vérifie que la pause ne remplace pas la désactivation d’urgence.

Historiquement, pour l’étape 12, **431 tests passaient**, ainsi que lint, formatage et builds
web/bureau. Le navigateur a testé les deux mains, la sélection sans replay,
la perte, le retour sous une nouvelle identité de même latéralité, l’ambiguïté
et le reset. Le wrapper Desktop et le vrai contrôleur ont également été reliés
dans le navigateur à un exécuteur simulé : activation conditionnée à une sélection,
annulation entre deux images, attente de la nouvelle main, arrêt accessible après
perte et conservation de la pause. Captures 1440/390 px inspectées, aucun
débordement ni erreur JavaScript.

Electron Windows a vérifié séparément via IPC et le vrai helper : annulation
de l’ancienne cible, rejet des anciennes captures, nouvelles commandes portant
une autre identité, pause en réduction, arrêt global, rechargement et fermeture.
Ces essais utilisent des observations ou paquets synthétiques ; le parcours
avec la vraie webcam reste nécessaire.

Pour le comportement actuel de contrôle automatique :

- Pointer avec une main : la simulation puis le vrai curseur suivent sans menu.
- Ajouter l’autre main et pointer avec les deux : la main qui contrôlait garde le rôle.
- Retirer la main contrôlante puis la ramener et repointer : le curseur s’arrête
  pendant l’absence et reprend automatiquement. Tester aussi le relais vers une
  autre main qui pointe. La pause volontaire doit rester active après une perte.

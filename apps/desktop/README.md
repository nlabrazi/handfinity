# Handfinity — Desktop

Ce socle Electron 45.0.0 ouvre une fenêtre **Handfinity Desktop** sur Windows 11
x64. Elle utilise directement `playground/view` : même caméra, mêmes diagnostics,
même moteur et même simulation. Le curseur simulé suit le bout de l'index de la
main principale lorsque le pointage est confirmé.

Le contrôle de la souris et du clavier Windows n'est pas encore implémenté.
L'étape 9 ajoute le suivi en arrière-plan, vérifié sous Windows avec une caméra
simulée et restant à valider avec la vraie webcam.
Les déplacements système appartiennent à l'étape 10 et l'installeur de
distribution à l'étape 27.

## Responsabilités

- **Electron** crée la fenêtre et sert les fichiers compilés depuis
  `handfinity://app/`. Le processus de fenêtre est isolé, sans accès direct à
  Node.js. La page locale de l'application peut demander la caméra vidéo ; les
  autres permissions sont refusées. `backgroundThrottling: false` est réglé dès
  la création de la fenêtre pour désactiver la limitation des timers en
  arrière-plan. Aucun pont IPC n'est ajouté à cette étape.
- **La vue partagée du Playground** utilise `core`, `vision` et `interactions`
  pour analyser les images et simuler les commandes. Aucune reconnaissance des
  gestes n'est recopiée dans le code bureau. Le renderer bureau configure
  `trackingOptions: { scheduling: "timer" }` ; le navigateur conserve
  `requestAnimationFrame` par défaut. La session de vision possède toujours
  une seule boucle et un seul suivi d'identités.
- **Le lanceur** utilise Electron Windows quand la commande part de WSL2.
  WSL2 compile le projet ; la caméra et les calculs fonctionnent dans la fenêtre
  Electron exécutée sur Windows.

Le suivi bureau utilise `window.setTimeout` avec un délai de `1000 / 30` ms après
chaque traitement. La cadence maximale visée est de 30 itérations par seconde ;
le coût du traitement s'ajoute au délai, sans cadence garantie. Cette boucle
reste indépendante des frames d'animation, qui descendaient à environ une par
seconde dans l'essai Windows réduit malgré `backgroundThrottling: false`.
**Stop camera** annule le timer puis libère les ressources.

Un futur PC Ubuntu utilisera une version Linux issue du même projet, avec une
adaptation de l'exécuteur système. Son contrôle n'est pas livré ici. Un VPS
peut héberger le site et les téléchargements indépendamment de l'application
installée sur le PC. Le futur contrôle d'Android par caméra frontale demandera
une intégration native spécifique et une étude distincte.

## Démarrer depuis WSL2

Prérequis : Windows 11 x64, Node.js 24 et npm dans WSL2, l'interopérabilité
Windows de WSL activée et `unzip` disponible dans la distribution Linux.
Windows doit autoriser la caméra pour les applications de bureau.

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
adaptations de contrôle Linux restent ultérieures.

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
Ces mesures ne garantissent aucune cadence avec un autre matériel. La perte
et le retour d'une main sont couverts par les tests de session ; ils restent
à confirmer en arrière-plan avec la vraie webcam, comme le parcours complet.

## Vérifications manuelles

1. Lancer `npm run dev:desktop` depuis WSL2. Vérifier la fenêtre
   **Handfinity Desktop**, avec le Playground et **Start camera**. La caméra
   doit rester arrêtée : cela vérifie le lancement Windows et le démarrage
   explicite de la caméra.
2. Cliquer sur **Start camera**, tendre l'index, replier les trois autres doigts
   et garder le pouce séparé. Après confirmation, déplacer le bout de l'index :
   le cercle vidéo et le curseur de **Pointer commands** doivent suivre le même
   sens, et le journal recevoir des `pointer:move`. Cela vérifie la réutilisation
   réelle de la chaîne partagée dans Electron. **Images processed** doit augmenter,
   y compris sans main visible : chaque nouvelle image est comptée après son
   traitement par la vision et le moteur, indépendamment des commandes émises.
3. Présenter deux mains séparées, puis changer **Main hand**. Les nouvelles
   commandes doivent porter le numéro sélectionné. Mettre la principale au
   repos : le curseur simulé garde sa position et le compteur de commandes se
   fige après confirmation. **Images processed** continue à augmenter : cela
   vérifie le choix principal et les transitions sans interrompre la vision.
4. Relever **Images processed**, utiliser une autre application pendant au moins
   30 secondes, puis revenir. Le compteur doit avoir nettement progressé et la
   vidéo rester à jour, sans nouveau **Start camera**. Comparer avec une période
   de même durée au premier plan : cela vérifie la continuité du traitement,
   même si aucune main ne produit de commande.
5. Choisir **Main hand: Auto**, relever le compteur et l'identité d'une main,
   puis réduire Handfinity pendant au moins 30 secondes. Retirer la main du
   champ plusieurs secondes et la présenter de nouveau pendant la réduction.
   Restaurer la fenêtre : le compteur doit avoir progressé, la main revenue
   doit avoir une nouvelle identité et les diagnostics suivre ses mouvements.
   Cela vérifie le suivi hors premier plan, l'expiration et le retour d'une main,
   puis la reprise d'affichage.
6. Répéter trois cycles **Stop camera** / **Start camera**, dont un après une
   réduction. Vérifier la libération puis la reprise de la webcam, le retour de
   **Images processed** à zéro et le nettoyage du journal, du compteur de commandes
   et des postures à l'arrêt : cela vérifie les remises à zéro.
7. Avec l'accès caméra refusé dans Windows, cliquer sur **Start camera** : un
   message d'erreur doit apparaître. Rétablir l'autorisation et recommencer.
   Pendant le suivi, vérifier que seul l'indicateur caméra est actif, sans
   microphone. Cela vérifie l'erreur utilisateur et le périmètre vidéo.
8. Fermer la fenêtre pendant le suivi, puis relancer l'application. La webcam
   doit être libérée à la fermeture, rester arrêtée au retour et le compteur
   **Images processed** rester à zéro jusqu'à **Start camera** : cela vérifie le
   cycle de vie du processus et l'absence de démarrage implicite.

Avec ce réglage Electron, `document.visibilityState` reste `visible` même lorsque
la fenêtre est réduite : cette valeur ne prouve pas son état natif. Les essais
doivent réellement changer d'application ou réduire la fenêtre Windows.
Le compteur de commandes peut rester fixe pendant un suivi valide ; utiliser
**Images processed** pour observer le traitement des nouvelles images.

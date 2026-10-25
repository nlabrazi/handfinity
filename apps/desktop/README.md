# Handfinity — Desktop

Ce socle Electron 45.0.0 ouvre une fenêtre **Handfinity Desktop** sur Windows 11
x64. Elle utilise directement `playground/view` : même caméra, mêmes diagnostics,
même moteur et même simulation. Le curseur simulé suit le bout de l'index de la
main principale lorsque le pointage est confirmé.

Le contrôle de la souris et du clavier Windows n'est pas encore implémenté.
Le suivi en arrière-plan appartient à l'étape 9, les déplacements système à
l'étape 10 et l'installeur de distribution à l'étape 27.

## Responsabilités

- **Electron** crée la fenêtre et sert les fichiers compilés depuis
  `handfinity://app/`. Le processus de fenêtre est isolé, sans accès direct à
  Node.js. La page locale de l'application peut demander la caméra vidéo ; les
  autres permissions sont refusées. Aucun pont IPC n'est ajouté à cette étape.
- **La vue partagée du Playground** utilise `core`, `vision` et `interactions`
  pour analyser les images et simuler les commandes. Aucune reconnaissance des
  gestes n'est recopiée dans le code bureau.
- **Le lanceur** utilise Electron Windows quand la commande part de WSL2.
  WSL2 compile le projet ; la caméra et les calculs fonctionnent dans la fenêtre
  Electron exécutée sur Windows.

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

Les tests bureau vérifient l'origine locale, le confinement des fichiers et
les permissions vidéo. Les tests du moteur et de la simulation restent partagés.
Le lancement natif Windows depuis WSL2, le chargement de MediaPipe, les cycles
caméra et la fermeture pendant le suivi ont aussi été vérifiés avec une caméra
simulée. Les essais avec une vraie webcam restent à réaliser.

## Vérifications manuelles

1. Lancer `npm run dev:desktop` depuis WSL2. Vérifier la fenêtre
   **Handfinity Desktop**, avec le Playground et **Start camera**. La caméra
   doit rester arrêtée : cela vérifie le lancement Windows et le démarrage
   explicite de la caméra.
2. Cliquer sur **Start camera**, tendre l'index, replier les trois autres doigts
   et garder le pouce séparé. Après confirmation, déplacer le bout de l'index :
   le cercle vidéo et le curseur de **Pointer commands** doivent suivre le même
   sens, et le journal recevoir des `pointer:move`. Cela vérifie la réutilisation
   réelle de la chaîne partagée dans Electron.
3. Présenter deux mains séparées, puis changer **Main hand**. Les nouvelles
   commandes doivent porter le numéro sélectionné. Mettre la principale au
   repos : le curseur simulé garde sa position et le compteur se fige après
   confirmation. Cela vérifie le choix principal et les transitions.
4. Répéter trois cycles **Stop camera** / **Start camera**. Vérifier la libération
   puis la reprise de la webcam, et le nettoyage du journal, du compteur et des
   postures à l'arrêt : cela vérifie les remises à zéro.
5. Avec l'accès caméra refusé dans Windows, cliquer sur **Start camera** : un
   message d'erreur doit apparaître. Rétablir l'autorisation et recommencer.
   Pendant le suivi, vérifier que seul l'indicateur caméra est actif, sans
   microphone. Cela vérifie l'erreur utilisateur et le périmètre vidéo.
6. Fermer la fenêtre pendant le suivi, puis relancer l'application. La webcam
   doit être libérée à la fermeture et rester arrêtée au retour : cela vérifie
   le cycle de vie du processus et l'absence d'état conservé.

La réduction de fenêtre et le changement d'application ne sont pas des critères
de validation de ce lot : le suivi hors premier plan sera traité à l'étape 9.

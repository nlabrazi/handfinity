# Passation — Handfinity

## Consignes de travail à conserver

- Échanger en français, avec des explications concrètes pour un développeur junior.
- Une fonctionnalité par commit ; découper davantage si nécessaire. Pas de gros
  lot mélangeant plusieurs étapes, même lorsqu'une autonomie est autorisée.
- L'utilisateur réalise `git add`, `git commit` et le push. Ne pas les exécuter.
- Livrer une seule étape à la fois et attendre la validation de l'utilisateur
  avant la suivante, sauf instruction explicite conservant un découpage atomique.
- Inclure les tests adaptés et terminer chaque bilan par une liste simple :
  quoi tester, comment et quel résultat vérifier, avec sa raison.
- Conserver le template du README : badges, illustration centrée, titres avec
  emojis, ordre des grandes sections, séparateurs, tableau des commandes et
  liens de pied de page. Modifier son contenu, sans réécrire son organisation.
- Limiter les changements à la demande. Ne pas réorganiser les fichiers ou
  adopter une technologie par initiative personnelle.
- Expliquer les responsabilités avec les appareils concrets : développement
  sous WSL2, essais web dans Firefox Windows, application Electron sur Windows.
  Distinguer un PC Ubuntu d'un VPS d'hébergement pour éviter toute confusion.
- Retirer le code sans usage actuel au lieu de garder des démonstrations ou
  abstractions « au cas où ». L'historique Git conserve les expériences retirées.

## Objectif et décisions validées

Handfinity vise le remplacement progressif de la souris et du clavier sur PC,
dans les applications existantes, y compris le navigateur. Un site web ne doit
pas avoir à intégrer Handfinity pour être utilisable avec le futur contrôle PC.
Un geste explicite devra permettre d'invoquer un clavier et d'écrire dans
l'application utilisée. Le smartphone et les lunettes AR viendront ensuite.

Deux interfaces web sont conservées :

- **Accueil** : présentation du produit et accès au laboratoire, avec son identité visuelle.
- **Playground** : observation et vérification du moteur effectivement partagé
  avec la future application PC. Une seconde interprétation des gestes propre
  aux démonstrations ne doit pas être ajoutée.

Windows 11 x64 est confirmé comme première cible ; Electron 45.0.0 est retenu.
L'utilisateur développe sous WSL2 et teste le web dans Firefox Windows. Le
lanceur bureau exécutera Electron Windows depuis WSL2, avec la webcam Windows.
Un projet et un moteur communs serviront aux versions Windows et Linux ; les
adaptations de contrôle propres aux systèmes seront développées séparément.

Un futur PC Ubuntu pourra exécuter la version Linux ; le VPS reste disponible
pour héberger un site. Le futur objectif Android consiste à contrôler les autres
applications du téléphone grâce aux gestes vus par sa caméra frontale. Cette
partie demandera une intégration native et des essais distincts. Ces perspectives
ne sont pas ajoutées à l'étape 8.

## État Git et travail réalisé

Dépôt : `/home/kaox/code/bricolage/handfinity`.

Le dernier commit constaté à la reprise de l'étape 8 est :

```text
d18d337 docs: update README and documentation to reflect current state and new pointer command types
```

Le commit `7f6d27b` contient l'ensemble des étapes de recadrage 1 à 5.
Le lot livré avait regroupé ces étapes malgré le découpage demandé. Ne pas prétendre que
cinq commits distincts ont été faits et ne pas réécrire cet historique sans
demande explicite. La [roadmap](roadmap.md) contient les commits antérieurs utiles
et le plan des étapes 6 à 27.

Le commit `47e94db` restaure le template du README depuis `35413b6` et prépare
la passation. Malgré son titre `docs`, `352f8e4` contient aussi le moteur commun
de l'étape 6. `d18d337` contient les commandes et la simulation de l'étape 7,
testées, revues et validées par l'utilisateur. Le dépôt était propre sur
`staging` avant les modifications de l'étape 8, qui lui sont laissées pour
validation et commit. À chaque reprise, vérifier `git status --short` et
`git log` pour connaître l'état réel.

## Existant conservé

| Emplacement | Responsabilité actuelle |
| --- | --- |
| `apps/hub` | Accueil, navigation vers le laboratoire et animations actives |
| `apps/playground` | Diagnostics caméra, choix de main, simulation et journal des commandes |
| `apps/desktop` | Fenêtre Electron locale réutilisant la vue du Playground et lancement Windows depuis WSL2 |
| `packages/core` | Observations, identités, postures, pincement interne et lissage |
| `packages/vision` | Caméra, MediaPipe, boucle de suivi et nettoyage des ressources |
| `packages/interactions` | Moteur commun des postures, pointeurs, choix principal et commandes de déplacement |

Paint, ses adaptateurs dédiés, les exercices de cartes/tuiles, leurs contrôleurs
et leurs tests spécifiques ont été supprimés. Les fichiers de démarrage
inutilisés, exports et dépendances sans consommateur ont été nettoyés.

Les scripts, le lockfile et Docker ne référencent plus ces éléments. Nginx et
la production web restent utiles aux deux interfaces conservées. Jenkins
utilise les commandes du dépôt ; aucune CI Windows n'est encore présente.

La session de vision conserve l'unique tracker d'identités.
`createGestureEngine` dans `packages/interactions/src/gesture-engine.ts`
assemble `createHandPoseTracker` puis `createHandPointerTracker` sans Vue ni
caméra. Dans `apps/playground/src/App.vue`, `handleTrackingFrame` consomme le
résultat du moteur et affiche les diagnostics. Le moteur produit maintenant
les commandes de déplacement consommées par `createPointerSimulation`.

L'application bureau importe directement `playground/view`. Son processus
principal crée la fenêtre et sert les fichiers compilés depuis
`handfinity://app/`. Seule la page locale de cette fenêtre peut demander la
caméra vidéo. Le renderer est isolé et sandboxé, sans intégration Node.js ni
pont IPC sans usage actuel.

**Aucune exécution système, commande de boutons, de défilement, de clavier ou
bibliothèque publiée n'est implémentée.**

## Étape 8 — implémentée, à valider

```text
chore(desktop): bootstrap the Windows application
```

Le workspace `apps/desktop` ajoute la fenêtre **Handfinity Desktop**, les
compilations du processus principal et du renderer, la politique locale de
fichiers et de permissions, et un lanceur adapté à WSL2. L'interface reste
celle des diagnostics et de la simulation du Playground. Aucune logique de
gestes n'est recopiée.

Depuis WSL2, `npm run dev:desktop` compile puis lance le binaire Electron
Windows. Le premier lancement garde l'archive dans le cache ignoré
`apps/desktop/node_modules/.cache/` et l'extrait avec `unzip` dans
`%LOCALAPPDATA%\Handfinity\Cache\electron-45.0.0-x64`. Chromium doit lancer ses
processus depuis le disque Windows local ; le projet compilé reste accessible
via UNC. Les protections d'Electron sont conservées.
Il ne demande pas de second clone Windows. Hors WSL2, le lanceur utilise
Electron de la plateforme courante.

`npm run build:desktop` compile sans ouvrir la fenêtre ; `npm run start:desktop`
lance le dernier build. Il n'y a pas de HMR dans ce lot : fermer la fenêtre et
relancer après une modification. `npm ci` ne télécharge pas Electron à l'avance ;
un accès réseau est nécessaire au premier lancement. Les fichiers MediaPipe et
le modèle restent chargés depuis leurs hébergements externes.

Le contrat du moteur de l'étape 7 reste `{ tracking, poses, pointers, commands }`.
Les commandes `pointer:move` sont toujours simulées. L'arrêt caméra et la
fermeture de la fenêtre doivent libérer les ressources ; le redémarrage demande
une nouvelle action **Start camera**. Les essais sont décrits dans le
[guide Desktop](../apps/desktop/README.md#vérifications-manuelles).

Le suivi hors premier plan appartient à l'étape 9, l'exécuteur système à
l'étape 10 et l'installeur distribuable à l'étape 27. Attendre la validation
de l'étape 8 par l'utilisateur avant de poursuivre.

## Plan de progression

- **6–7** : interprétation commune, puis commandes de pointeur et simulation.
- **8–10** : application PC, suivi hors premier plan et véritable curseur.
- **11–18** : pause, main principale, calibration, boutons, défilement et réglages.
- **19–24** : clavier superposé, invocation, touches, saisie, édition et raccourcis.
- **25–27** : parcours complets, CI Windows et distribution.

Pour une même séquence d'observations horodatées et les mêmes réglages, le moteur
doit produire les mêmes commandes. Le Playground simule leurs effets et
l'exécuteur PC les transmet au système. La simulation ne prouve pas le bon
fonctionnement sur Windows : des validations réelles seront nécessaires.

## Validation et lancement

Dernière validation connue du recadrage : **139 tests conservés passent**, lint,
formatage, deux builds web, installation propre Docker et image de production
Nginx vérifiés. Chrome a aussi testé les pages aux formats bureau/mobile,
la navigation et le cycle caméra avec une caméra simulée. L'utilisateur a
ensuite validé le recadrage. Ces résultats ne prouvent aucun contrôle natif.

Validation automatisée de l'étape 6 : **146 tests passent**, dont 7 nouveaux
cas d'intégration du moteur ; lint, formatage et builds des deux interfaces
réussis. L'utilisateur a également validé ses essais manuels de cette étape.

Validation de l'étape 7 : **157 tests passent**, lint, formatage et builds des
deux interfaces réussis. Chrome a vérifié le laboratoire à 1440 et 390 px avec
des observations synthétiques : émissions, déduplication, miroir, journal borné,
repos et arrêt, sans erreur JavaScript ni débordement horizontal. Ces contrôles
ne constituent pas des essais webcam réels. L'utilisateur a ensuite testé,
revu et validé cette étape avant son commit.

Validation automatisée de l'étape 8 : **201 tests passent**, dont 44 tests
supplémentaires de politique locale et de permissions. Lint, formatage, builds
web et bureau, installation propre et build du hub dans Docker réussis.

Electron Windows a été lancé depuis WSL2 et contrôlé avec une caméra simulée :
chargement réel de MediaPipe, traitement vidéo, trois cycles caméra avec pistes
libérées à l'arrêt, refus du microphone, navigation et fenêtres externes bloquées,
confinement des fichiers, redémarrage et fermeture pendant le suivi vérifiés.
Aucune erreur JavaScript non interceptée. Les chemins de fichiers ont également
été vérifiés avec Node Windows. Ces essais ne remplacent pas la validation avec
la vraie webcam de l'utilisateur ; aucun contrôle système ni suivi continu hors
premier plan n'est encore validé.

```bash
npm test
npm run lint
npm run format:check
npm run build
npm run build:desktop
```

```bash
npm run dev
# Accueil : http://localhost:3000
# Laboratoire : http://localhost:3000/playground

npm run dev -w playground
# Laboratoire autonome : http://localhost:3002

npm run dev:desktop
# Depuis WSL2 : compilation puis fenêtre Electron Windows
```

Docker conserve les services `hub` et `playground`. Ils ont été reconstruits et
redémarrés lors du recadrage ; le conteneur abandonné a été retiré. Vérifier leur
état actuel si nécessaire, sans supposer qu'ils tournent encore.

Dans le laboratoire : index tendu, majeur/annulaire/auriculaire repliés, pouce
séparé → `Pointing`, pointeur `active`, cercle plein dans la vidéo. Ouvrir les
cinq doigts ou pincer retire ce cercle après confirmation de la posture, sans
nécessairement retirer les numéros d'identité. Deux mains en pointage donnent
un cercle plein et un pointillé. `Main hand` change le rôle principal.

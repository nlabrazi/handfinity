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

Windows est la première cible proposée, pas une intégration déjà réalisée.
La technologie bureau et l'environnement de validation Windows restent à
confirmer avant l'étape 8. Aucun choix Electron, Tauri ou autre n'est arrêté.

## État Git et travail réalisé

Dépôt : `/home/kaox/code/bricolage/handfinity`.

Le dernier commit constaté à la reprise de l'étape 7 est :

```text
352f8e4 docs: update documentation for shared packages and gesture engine
```

Le commit `7f6d27b` contient l'ensemble des étapes de recadrage 1 à 5.
Le lot livré avait regroupé ces étapes malgré le découpage demandé. Ne pas prétendre que
cinq commits distincts ont été faits et ne pas réécrire cet historique sans
demande explicite. La [roadmap](roadmap.md) contient les commits antérieurs utiles
et le plan des étapes 6 à 27.

Le commit `47e94db` restaure le template du README depuis `35413b6` et prépare
la passation. Malgré son titre `docs`, `352f8e4` contient aussi le moteur commun
de l'étape 6. L'utilisateur l'a testé, validé, commité et poussé. Le dépôt était
propre sur `staging` avant les modifications de l'étape 7, qui lui sont laissées
pour validation et commit. À chaque reprise, vérifier `git status --short` et
`git log` pour connaître l'état réel.

## Existant conservé

| Emplacement | Responsabilité actuelle |
| --- | --- |
| `apps/hub` | Accueil, navigation vers le laboratoire et animations actives |
| `apps/playground` | Diagnostics caméra, choix de main, simulation et journal des commandes |
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

**Aucune application bureau, exécution système, commande de boutons, de
défilement, de clavier ou bibliothèque publiée n'est implémentée.**

## Étape 7 — implémentée, à valider

```text
feat(input): expose shared pointer commands
```

Le moteur expose `update(trackingFrame, aspectRatio)` →
`{ tracking, poses, pointers, commands }`, `setPrimaryHand(id)` et `reset()`.
`PointerMoveCommand` contient `type: "pointer:move"`, `handId`, `timestamp`
et `position: { x, y }`. Sa destination normalisée entre 0 et 1 a l'origine
en haut à gauche ; le moteur applique déjà le miroir horizontal à la position
lissée (`x = 1 - Source x`, `y = Source y`). Les diagnostics source restent
avant miroir et la simulation ne retourne pas les coordonnées à nouveau.

Chaque résultat du suivi alimente le moteur, même sans nouvelle image :
`advance()` peut expirer une identité. Les horodatages des observations
empêchent les trackers de confirmer une posture ou de lisser à nouveau une
image répétée. Seule une observation fraîche de la principale en pointage
confirmé émet un déplacement, une fois par image. Le repos, le pincement,
l'absence ou l'ambiguïté n'en produisent pas. Une image figée peut conserver
le diagnostic précédent jusqu'à l'expiration de 120 ms sans nouvelle commande.

Le Playground exécute uniquement les commandes reçues dans une zone dédiée,
conserve la dernière position sans commande, affiche les huit dernières
commandes et leur compteur total. L'arrêt réinitialise le moteur, la position
simulée, le journal et le compteur. La reconnaissance des gestes reste commune.

Les tests d'intégration du moteur utilisent les vrais trackers ; cinq cas de
commandes et six cas de simulation complètent les 146 tests de l'étape 6.
Les vérifications webcam restent à réaliser par l'utilisateur selon le
[guide du Playground](../apps/playground/README.md#vérifications-manuelles).
Attendre sa validation avant l'étape suivante.

L'étape 8 n'est pas commencée. Avant de l'entreprendre, confirmer Windows,
la machine de test et la technologie bureau avec l'utilisateur.

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
ne constituent pas des essais webcam réels, qui restent à faire par l'utilisateur.

```bash
npm test
npm run lint
npm run format:check
npm run build
```

```bash
npm run dev
# Accueil : http://localhost:3000
# Laboratoire : http://localhost:3000/playground

npm run dev -w playground
# Laboratoire autonome : http://localhost:3002
```

Docker conserve les services `hub` et `playground`. Ils ont été reconstruits et
redémarrés lors du recadrage ; le conteneur abandonné a été retiré. Vérifier leur
état actuel si nécessaire, sans supposer qu'ils tournent encore.

Dans le laboratoire : index tendu, majeur/annulaire/auriculaire repliés, pouce
séparé → `Pointing`, pointeur `active`, cercle plein dans la vidéo. Ouvrir les
cinq doigts ou pincer retire ce cercle après confirmation de la posture, sans
nécessairement retirer les numéros d'identité. Deux mains en pointage donnent
un cercle plein et un pointillé. `Main hand` change le rôle principal.

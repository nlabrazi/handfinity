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

Le dernier commit constaté avant cette correction documentaire est :

```text
7f6d27b chore: update docker configuration and remove screenshot
```

Il contient en réalité l'ensemble des étapes de recadrage 1 à 5. Le lot livré
avait regroupé ces étapes malgré le découpage demandé. Ne pas prétendre que
cinq commits distincts ont été faits et ne pas réécrire cet historique sans
demande explicite. La [roadmap](roadmap.md) contient les commits antérieurs utiles
et la liste des étapes 6 à 27 encore à réaliser.

La correction documentaire qui accompagne cette passation restaure le README
depuis son template au commit `35413b6`, avec le contenu actuel et une capture
de l'accueil actuel. Elle n'ajoute aucune fonctionnalité. À la reprise, vérifier
`git status --short` et `git log` pour savoir si l'utilisateur a déjà commité
cette correction et la passation.

## Existant conservé

| Emplacement | Responsabilité actuelle |
| --- | --- |
| `apps/hub` | Accueil, navigation vers le laboratoire et animations actives |
| `apps/playground` | Aperçu caméra, identités, postures, pointeurs et choix de main |
| `packages/core` | Observations, identités, postures, pincement interne et lissage |
| `packages/vision` | Caméra, MediaPipe, boucle de suivi et nettoyage des ressources |
| `packages/interactions` | Pointeurs et choix de la main principale |

Paint, ses adaptateurs dédiés, les exercices de cartes/tuiles, leurs contrôleurs
et leurs tests spécifiques ont été supprimés. Les fichiers de démarrage
inutilisés, exports et dépendances sans consommateur ont été nettoyés.

Les scripts, le lockfile et Docker ne référencent plus ces éléments. Nginx et
la production web restent utiles aux deux interfaces conservées. Jenkins
utilise les commandes du dépôt ; aucune CI Windows n'est encore présente.

La session de vision possède actuellement le tracker d'identités. Dans
`apps/playground/src/App.vue`, `handleTrackingFrame` assemble encore
`createHandPoseTracker` et `createHandPointerTracker`, puis rend les diagnostics.
Cette orchestration est le prochain périmètre de refactoring.

**Aucune application bureau, commande système, simulation de commande PC,
commande de clavier ou bibliothèque publiée n'est implémentée.**

## Prochaine étape : 6 uniquement

```text
refactor(engine): centralize the gesture processing pipeline
```

But : centraliser l'interprétation et faire consommer cette chaîne commune
par le Playground. Préserver les comportements observables actuels.

1. Lire le [cadrage](architecture.md), la [roadmap](roadmap.md), le composant
   principal du Playground et les trackers existants avant de modifier le code.
2. Définir un périmètre réduit de chaîne partagée. Éviter un second tracker
   d'identités en parallèle de celui déjà possédé par la session de vision.
   Éviter aussi une dépendance circulaire entre `core` et `interactions`.
3. Centraliser l'orchestration nécessaire et ses remises à zéro, puis brancher
   le Playground dessus. Le rendu et l'affichage des diagnostics restent dans Vue.
4. Tester les transitions réelles de la chaîne, les images répétées, les pertes,
   changements de main et redémarrages, selon le périmètre effectivement modifié.
5. Vérifier la caméra, les postures, le choix principal et les pointeurs dans
   le laboratoire. Livrer le bilan et attendre la validation.

Les commandes de pointeur et leur simulation appartiennent à l'étape 7.
L'application bureau commence à l'étape 8. Ne pas les inclure dans l'étape 6
et ne pas créer leurs abstractions en avance sans consommateur réel.

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

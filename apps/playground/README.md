# Handfinity — Playground

Le Playground sert à observer les mains, les postures reconnues, les pointeurs
et les commandes de déplacement produits par le moteur partagé. Il affiche les
diagnostics vidéo et simule les commandes dans une zone dédiée :
**il ne contrôle pas encore la souris ou le clavier du PC.**

Depuis la racine :

```bash
npm run dev
# http://localhost:3000/playground

# Ou le laboratoire autonome :
npm run dev -w playground
# http://localhost:3002
```

Cliquer sur **Start camera** puis autoriser la webcam. L'aperçu est en miroir.
**Stop camera** et la sortie de la page libèrent la caméra et le détecteur.

## Diagnostics

La caméra, la simulation et l’état de la main sont regroupés pour limiter le
défilement sur écran large. Les détails **Tracking and gesture details** et le
journal des commandes sont repliés, mais restent accessibles.

- **Controlling hand** : numéro attribué automatiquement. Le cercle plein marque
  la main de contrôle et le pointillé l’autre main.
- **Images processed** : nouvelles images analysées, indépendamment des commandes.
- **Hand identities**, **Hand poses** et coordonnées : détails de suivi et de posture.
- **Gesture control** : état de pause, progression et besoin de relâcher le geste.
- **Pointer commands** : simulation, coordonnées et journal des huit dernières commandes.

Tendre l’index, replier majeur, annulaire et auriculaire et séparer le pouce :
la main en pointage confirmé commande automatiquement. Deux mains peuvent rester
visibles ; si elles pointent simultanément, la main déjà active conserve le rôle.
Si elle ne pointe plus et qu’une autre pointe, celle-ci prend le relais. En cas
d’absence ou d’ambiguïté, les déplacements s’arrêtent et reprennent après une
nouvelle observation confirmée, sans menu. Au démarrage simultané, le plus petit
numéro est choisi. Les numéros sont locaux et ne prouvent pas l’identité physique
après une disparition ; une autre main pointante peut prendre le contrôle.

Une seule main visible au repos peut effectuer le geste de pause. Maintenir la
paume ouverte confirmée pendant **1,5 seconde** bascule la pause ; il faut
relâcher le geste avant un nouveau maintien. La pause reste active pendant la
perte et le retour d’une main. Si deux mains sont visibles sans main de contrôle,
pointer d’abord avec celle qui doit réaliser le geste. La caméra continue.

Le moteur applique le miroir horizontal : **Destination x = 1 − Source x**,
**Destination y = Source y**. La simulation utilise les mêmes commandes que le
bureau. Sans commande, elle garde sa dernière position. Le pincement n’émet pas
encore de clic.

## Cycle de vie

`createTrackingSession` possède la caméra, le détecteur, la boucle vidéo et le
suivi des identités. Seules les nouvelles images alimentent la détection.
L'expiration des identités continue sans nouvelle image tant que la boucle tourne.

`createGestureEngine` assemble postures, pointeurs, choix automatique et
commandes, sans Vue ni caméra. `update(tracking, aspectRatio)` consomme le suivi ;
`reset()` efface l’interprétation à l’arrêt. Aucun second suivi d’identités.

Chaque résultat de la session est traité, même sans nouvelle image : une image
répétée ne confirme pas de posture, n'est pas filtrée à nouveau et n'émet aucune
commande, mais les identités peuvent expirer. Le diagnostic peut conserver une
main jusqu'à son expiration de 120 ms sans produire de nouveau déplacement.
`createPointerSimulation` reçoit uniquement les commandes du moteur ; l'arrêt
efface aussi sa position, son journal et son compteur. L'application bureau
exécute ces déplacements sur le PC après activation explicite.

Un arrêt pendant l'initialisation libère les ressources déjà disponibles.
Une caméra ou un détecteur reçu tardivement est libéré sans relancer la session.
La même session peut être arrêtée puis redémarrée. Quitter la route détruit le
laboratoire ; le retour demande un nouveau démarrage explicite.

## Vérifications automatiques

```bash
npm test
npm run lint
npm run format:check
npm run build
```

Les tests du socle vérifient identités, ambiguïtés, durées de confirmation,
images répétées, lissage indépendant, choix principal et nettoyage des sessions.
Les tests d'intégration du moteur utilisent les vrais trackers pour vérifier
leur enchaînement, la production déterministe des commandes, leur déduplication
et la remise à zéro commune. Les tests de l’étape 11 couvrent les 1 500 ms, les
images répétées, les interruptions, le relâchement obligatoire, la main autorisée
et la persistance de la pause. Une intégration vérifie le même arrêt des commandes
dans la simulation et le contrôleur Windows. Les tests de simulation vérifient l'exécution
directe des destinations, le journal borné, les instantanés et le nettoyage.

## Vérifications manuelles

1. Démarrer la caméra et pointer avec une main : un cercle plein apparaît et la
   simulation suit l’index sans sélection. But : vérifier le contrôle automatique.
2. Présenter une deuxième main puis pointer avec les deux : la première garde le
   contrôle. Cesser de pointer avec elle en laissant l’autre pointer : le rôle
   passe à l’autre. But : vérifier la présence de deux mains et le transfert.
3. Retirer la main contrôlante puis la ramener et repointer : la simulation se
   fige pendant l’absence puis reprend sans utiliser la souris. But : vérifier le retour.
4. Mettre en pause par paume ouverte 1,5 seconde, retirer et ramener la main :
   la pause reste active. Relâcher puis refaire le geste pour reprendre. But :
   vérifier que le retour automatique ne contourne pas la pause.
5. Arrêter et redémarrer la caméra : les diagnostics, le journal et le moteur
   repartent à zéro. But : vérifier le nettoyage de la session.

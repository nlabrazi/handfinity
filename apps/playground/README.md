# Handfinity — Vision Playground

Laboratoire de suivi des mains et d'interactions gestuelles. Depuis la racine
du monorepo :

```bash
npm run dev -w playground
```

L'application autonome est disponible sur `http://localhost:3002`. Le hub
(`npm run dev`) propose le même laboratoire sur `http://localhost:3000/playground`,
avec un retour vers l'accueil immersif. Cliquer sur
**Start camera** puis autoriser l'accès à la webcam.

## Suivi de deux mains

Le panneau **Hand identities** et les numéros près des poignets permettent
d'observer les identités produites par `createHandIdentityTracker` dans `core`.
La couleur accompagne le numéro ; elle ne désigne pas une main gauche ou droite.

- Deux mains séparées conservent leur numéro pendant les déplacements ordinaires,
  même lorsque l'ordre des résultats du détecteur change.
- Une main absente devient `missing`. Son identité peut être retrouvée à proximité
  pendant 120 ms ; au-delà, elle expire (`timeout`). Une image figée provoque
  également cette expiration. Une nouvelle apparition reçoit un nouveau numéro.
- Des paumes trop proches ou plusieurs associations presque équivalentes
  déclenchent `Ambiguous positions`. Les anciennes identités prennent fin et
  de nouveaux numéros sont attribués quand les observations sont à nouveau distinctes.
- **Last tracking event** indique les apparitions et les pertes : `timeout`,
  `ambiguous`, ou `replaced` lorsqu'une main visible remplace une piste manquante.
- L'arrêt caméra efface le suivi. Les numéros ne sont pas réutilisés pendant
  la vie du tracker ; ils ne constituent pas une reconnaissance persistante
  d'une personne ou de sa main.

Le suivi compare les centres des paumes et leur taille, en tenant compte du
format vidéo. La latéralité fiable sert seulement d'indice complémentaire.
Ces seuils sont des heuristiques à éprouver avec la webcam : un mouvement très
rapide peut entraîner une nouvelle identité, et deux mains indiscernables ne
peuvent pas être réidentifiées avec certitude après une occultation.

Chaque main peut produire un pointeur ; seule la main principale pilote le
survol des cibles. Le journal du pincement et le dessin dans Paint restent à
une main. Un changement d'identité réinitialise le filtre de son pointeur ; Paint
termine le trait avant de recevoir une autre identité.

## Postures reconnues

Le panneau **Hand poses** affiche un diagnostic pour chaque identité, y compris
lorsque deux mains distinctes sont présentes :

- **Confirmed** : la posture stabilisée, parmi `Pointing`, `Open palm`, `Pinch`
  et `Unknown`.
- **Candidate** : la configuration actuellement estimée. `confirming` indique
  une transition en attente de confirmation.
- Les cinq doigts sont estimés `extended` (tendus), `folded` (repliés) ou
  `uncertain` (indéterminés). Les couleurs accompagnent les libellés.
- **Pinch ratio** : la distance pouce/index divisée par la taille de la paume.
  Ce ratio est une mesure géométrique, pas un score de confiance.

Pour `Pointing`, tendre l'index en repliant les trois autres doigts ; le pouce
reste libre. Pour `Open palm`, tendre les cinq doigts et écarter le pouce de la
paume. Pour `Pinch`, rapprocher les bouts du pouce et de l'index ; le pincement
est prioritaire sur les autres configurations. Un poing ou une configuration
non reconnue revient à `Unknown` si elle ne forme pas un pincement.

Le pointage et la paume ouverte demandent 80 ms de stabilité. Le pincement
réutilise les confirmations de 40 ms à la fermeture et de 60 ms au relâchement,
avec des seuils distincts pour limiter les oscillations. La posture confirmée
peut donc rester affichée brièvement pendant une transition. Une main manquante
ou des repères invalides effacent immédiatement sa posture. Une reprise demande
une nouvelle confirmation, et l'arrêt caméra vide tous les diagnostics.

Les postures reposent sur la géométrie estimée par la webcam : garder la main
entièrement visible et commencer face à la caméra. Les diagnostics des doigts
permettent de repérer une estimation incertaine avant d'ajuster la posture.
Le survol utilise la posture `Pointing` confirmée. Le journal du pincement à une main reste disponible pendant les essais.

## Pointeurs et survol des cibles

La zone **Navigation sandbox** présente quatre cartes : Paint, Playground et
deux projets à venir. Tendre l'index et replier majeur, annulaire et auriculaire
jusqu'à confirmer `Pointing` pour faire apparaître le pointeur de cette main.
Une paume ouverte, un pincement ou `Unknown` retire son pointeur après la
transition de posture. Les pertes de suivi et l'arrêt caméra le retirent immédiatement.

- Chaque pointeur porte le numéro de sa main et possède son propre lissage.
  Le miroir est appliqué une seule fois lors de la projection dans la zone.
- Le curseur de la **main principale** a un contour plein. Lui seul met une
  carte en surbrillance ; le second pointeur a un contour pointillé.
- En mode **Automatic**, la première main qui confirme le pointage devient
  principale. Si les deux le confirment ensemble, le plus petit numéro gagne.
  Cette main garde le contrôle lorsqu'elle change de posture : l'autre main
  ne récupère pas le survol pendant une simple pause.
- Le sélecteur **Main hand** permet de choisir explicitement un numéro de main,
  même si elle est au repos. Revenir à **Automatic** choisit à nouveau parmi
  les mains actuellement en pointage.
- Une main principale brièvement manquante réserve son rôle pendant la tolérance
  du suivi d'identités (120 ms). Son curseur et son survol sont retirés pendant
  l'absence. Après expiration de l'identité, le choix redevient automatique.
- Une ambiguïté efface les pointeurs et le choix principal. Chaque retour de
  pointage, nouvelle identité ou reprise après absence initialise le filtre à
  la position courante, sans relier les positions de deux mains.
- Les positions hors image sont ignorées. Les cibles sont mesurées à partir
  des rectangles affichés, après chaque mise à jour et lors des redimensionnements
  ou défilements, y compris dans un conteneur imbriqué.

`@handfinity/interactions` fournit les pointeurs, le choix principal, la
projection et le calcul des cibles sans dépendre de Vue ou du DOM. Le composant
lit les dimensions affichées et rend les résultats. Les cartes illustrent le
survol ; la sélection et l'annulation constituent l'étape suivante.

## Session partagée avec Paint

`createTrackingSession` dans `@handfinity/vision` possède la caméra, le détecteur,
la boucle vidéo et le suivi des identités. Playground traite les résultats pour
ses diagnostics, son pincement et le survol ; il ne gère plus sa propre boucle
d'acquisition. Une même session peut être redémarrée sans réutiliser les numéros
de main déjà attribués.

Quitter Playground ou arrêter la caméra arrête sa session. Si le démarrage est
encore en attente, les ressources disponibles sont libérées immédiatement et
les résultats tardifs sont ignorés et nettoyés. L'ouverture d'un autre projet
demande un nouveau démarrage explicite de la caméra.

## Vérifications

```bash
npm test
npm run lint
npm run format:check
npm run build
```

Pour valider les postures :

1. Ouvrir `http://localhost:3000/playground` après `npm run dev`, puis activer
   la caméra. Tendre l'index avec les trois autres doigts repliés et maintenir
   une demi-seconde : **Confirmed** doit afficher `Pointing`.
2. Ouvrir les cinq doigts avec le pouce dégagé : `Open palm` doit être confirmé.
   Fermer la main en gardant le pouce à distance du bout de l'index : `Unknown`
   doit apparaître après la transition.
3. Pincer pouce et index puis relâcher : `Pinch` doit être confirmé puis quitter
   cet état. Faire varier lentement l'écartement près du contact ; le diagnostic
   ne doit pas osciller à chaque petite variation.
4. Présenter deux mains séparées, l'une en pointage et l'autre ouverte. Chaque
   numéro doit afficher sa propre posture. Retirer une main puis la ramener :
   sa posture doit se confirmer à nouveau sans perturber celle de l'autre.
5. Essayer la main gauche puis la droite, tourner progressivement la main dans
   le plan de l'image et modifier sa distance à la caméra. En cas de résultat
   inattendu, relever le numéro, **Candidate**, les états des doigts et le ratio.
6. Arrêter la caméra puis la redémarrer : aucune posture précédente ne doit
   rester confirmée. Vérifier également le dessin par pincement dans Paint.

Les tests automatisés vérifient précisément les durées, les brèves variations,
les images répétées, les identités indépendantes, les pertes et ambiguïtés ainsi
que les transformations géométriques sur des repères synthétiques. Les essais
ci-dessus servent à évaluer les estimations réelles de la webcam.

Pour valider le suivi dans le hub :

1. Lancer `npm run dev`, ouvrir `http://localhost:3000/playground`, puis cliquer
   sur **Start camera** et autoriser la webcam.
2. Présenter une main, puis la seconde en les gardant séparées. Déplacer chacune
   lentement : les numéros doivent rester attachés aux mêmes mains ; l'arrivée
   de la seconde ne doit pas renuméroter la première.
3. Retirer une main pendant environ une seconde : seul son numéro doit disparaître,
   avec une perte `timeout`. La ramener : elle doit recevoir un nouveau numéro.
   La fenêtre de récupération de 120 ms est vérifiée précisément par les tests unitaires.
4. Rapprocher les paumes jusqu'à les superposer. Lorsque le suivi signale une
   ambiguïté, les anciens numéros doivent disparaître. Séparer les mains pour
   retrouver deux nouvelles identités.
5. Arrêter la caméra : les numéros, le curseur, le compteur et le pincement doivent
   être effacés. Redémarrer et vérifier que les numéros repartent avec de nouvelles valeurs.
6. Ouvrir `http://localhost:3000/paint`, démarrer la caméra et dessiner par pincement.
   Faire entrer une seconde main : le trait doit s'arrêter. Retirer les mains,
   puis dessiner ailleurs : aucun segment ne doit relier les deux traits.

Pour valider le cycle de vie commun :

1. Dans chaque projet, répéter **Start camera** / **Stop camera** trois fois :
   le suivi doit reprendre normalement et l'usage de la caméra cesser à l'arrêt.
2. Dessiner dans Paint, passer à Playground, y démarrer la caméra puis revenir
   dans Paint : le dessin et Undo/Redo doivent être conservés, avec la caméra
   arrêtée jusqu'au prochain démarrage explicite.
3. Pour observer un démarrage lent, activer une limitation réseau dans les outils
   du navigateur et désactiver le cache, puis recharger la page. Démarrer la caméra
   et quitter le projet pendant **Initializing...**. La caméra déjà acquise doit
   être libérée ; la fin tardive du chargement ne doit pas la réactiver. Revenir,
   rétablir le réseau normal et démarrer une nouvelle session.
4. Refuser l'autorisation caméra, vérifier le message d'erreur et le bouton à nouveau
   disponible, puis autoriser la caméra dans les réglages du site et réessayer.

Pour valider les pointeurs et les cibles :

Le workspace `@handfinity/interactions` doit être installé avec `npm install`.
Avec Docker, reconstruire et recréer le hub avec
`docker compose up -d --build --force-recreate hub` : son démarrage exécute
`npm ci` pour actualiser le volume de dépendances.

1. En mode **Automatic**, confirmer `Pointing` avec une main. Viser les quatre
   cartes puis les espaces entre elles : le contour plein doit suivre l'index,
   et seule la carte sous son centre doit être surlignée.
2. Ouvrir la paume ou pincer : le pointeur et le survol doivent disparaître dès
   que la nouvelle posture est confirmée. Revenir au pointage ailleurs : le
   pointeur doit reprendre à cette position.
3. Présenter une seconde main en pointage, bien séparée de la première : un
   curseur pointillé doit apparaître. Déplacer cette seconde main sur une autre
   carte : elle ne doit pas changer la carte survolée par la main principale.
4. Choisir le numéro de la seconde main dans **Main hand** : son curseur doit
   devenir plein et piloter le survol. Mettre cette main au repos : le survol
   disparaît sans passer à l'autre. Revenir à **Automatic** pour refaire le choix.
5. Retirer la main principale pendant une seconde en gardant l'autre en pointage :
   le survol doit s'effacer, puis la main restante devenir principale après la
   perte de l'ancienne identité. Croiser les mains jusqu'à signaler une ambiguïté,
   puis les séparer : les anciens curseurs ne doivent pas subsister.
6. Réduire la largeur de la fenêtre et faire défiler la page manuellement : les
   curseurs doivent rester alignés avec les cartes, et le survol suivre leur
   disposition. Vérifier aussi les bords et les espaces entre les cartes.
7. Arrêter la caméra : les curseurs, le survol et le choix manuel doivent être
   effacés. Vérifier ensuite le dessin par pincement dans Paint.

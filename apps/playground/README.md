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

Le curseur et le pincement restent limités à une seule main à cette étape.
Un changement d'identité réinitialise le curseur et le geste. Paint utilise
également ce suivi pour terminer le trait avant de recevoir une autre identité.

## Navigation sandbox — étape 1

La zone **Navigation sandbox** permet de tester le pointage sur quatre cartes :
Paint, Playground et deux projets à venir. Elle est affichée à côté des diagnostics
sur grand écran, et en dessous sur petit écran.

- Déplacer l'index déplace le curseur dans la zone de cartes. Le repère est en
  miroir, comme l'aperçu caméra.
- La position est lissée avec `createPointSmoother`, partagé dans
  `@handfinity/core` et réexporté par `@handfinity/vision` pour Paint.
  Le filtre conserve sa constante de temps de 30 ms et ses tests existants.
- La carte située sous le centre du curseur reçoit une bordure lumineuse et un
  indicateur rempli. Un statut textuel annonce la carte survolée.
- Les dimensions réelles des cartes servent au calcul du survol, y compris
  après redimensionnement. Leur position reste stable pendant le survol.
- Une absence de main, deux mains ou l'arrêt de la caméra retirent le curseur
  et le survol. Une image vidéo figée retire également le curseur après plus de
  120 ms sans nouveau point valide. Le filtre repart de la nouvelle position
  lorsque la main est retrouvée.
- Le squelette des mains, leur compteur et les transitions de pincement restent
  disponibles dans le panneau caméra.

Cette première étape porte sur le **survol** : les cartes ne déclenchent aucune
navigation, y compris lors d'un pincement. La sélection au relâchement puis le
défilement gestuel feront l'objet des deux prochaines itérations.

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

Pour un essai avec la webcam, viser successivement les quatre cartes puis les
espaces entre elles. Déplacer l'index lentement, puis plus rapidement ; masquer
la main et la faire réapparaître ailleurs ; présenter deux mains ; arrêter et
redémarrer la caméra. Vérifier que le curseur et le survol disparaissent et
reprennent correctement. Essayer également une fenêtre étroite et le défilement
manuel de la page pour vérifier l'alignement des cibles.

# Handfinity — Vision Playground

Laboratoire de suivi des mains et d'interactions gestuelles. Depuis la racine
du monorepo :

```bash
npm run dev -w playground
```

L'application est disponible sur `http://localhost:3000`. Cliquer sur
**Start camera** puis autoriser l'accès à la webcam.

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

## Vérifications

```bash
npm test
npm run lint
npm run format:check
npm run build
```

Pour un essai avec la webcam, viser successivement les quatre cartes puis les
espaces entre elles. Déplacer l'index lentement, puis plus rapidement ; masquer
la main et la faire réapparaître ailleurs ; présenter deux mains ; arrêter et
redémarrer la caméra. Vérifier que le curseur et le survol disparaissent et
reprennent correctement. Essayer également une fenêtre étroite et le défilement
manuel de la page pour vérifier l'alignement des cibles.

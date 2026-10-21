# Handfinity Paint — V1.1, étape 1

Application Vue 3 permettant de dessiner avec l'index pendant un pincement
pouce-index. Depuis la racine du monorepo :

```bash
npm run dev -w paint
```

## Tracé et relâchement

- Le curseur et le pinceau utilisent la même position filtrée. Le filtre dépend
  du temps écoulé, avec une constante de 30 ms, plutôt que du nombre d'images.
- Le dessin utilise des courbes quadratiques. Seule leur dernière portion reste
  sur un Canvas temporaire, jusqu'à la position du curseur.
- Le pincement doit rester fermé pendant 40 ms pour commencer un trait.
- Dès qu'une ouverture est détectée, la pointe est figée au dernier point fiable.
  Une ouverture maintenue pendant 60 ms termine le trait ; une mesure isolée
  laisse le même trait reprendre. Aucun nombre fixe de points n'est supprimé.
- La portion temporaire est conservée à la fin du trait et incluse dans l'export
  PNG, même si le pincement est encore actif. La webcam n'est pas exportée.

## Perte de suivi

Une absence de main peut être tolérée jusqu'à 120 ms depuis la dernière détection.
La reprise n'est autorisée que si l'index et le poignet restent proches de leur
ancienne position (au plus une demi-longueur de paume). Une reprise éloignée,
une absence prolongée, une vidéo figée ou deux mains détectées terminent le trait.
Un nouveau pincement doit ensuite être confirmé pour commencer un autre trait.

Ces délais utilisent l'horloge du navigateur. Leur observation reste limitée
par la cadence réelle de la caméra et du traitement.

**Clear** annule le trait en cours et efface les deux Canvas. Si la main reste
pincée, il faut relâcher puis pincer à nouveau pour dessiner.

## Vérifications

```bash
npm test
npm run lint
npm run format:check
npm run build
```

Les tests couvrent le filtrage, la terminaison des traits, les transitions du
pincement et les interruptions de suivi. La CI exécute les suites de Paint,
core et vision.

Pour valider le ressenti avec une webcam : dessiner un point, un petit trait,
une ligne lente puis un cercle rapide ; relâcher en mouvement ; masquer brièvement
la main puis la faire réapparaître près et loin de sa position ; introduire une
seconde main. Vérifier aussi Clear, l'export pendant un trait et l'arrêt/reprise
de la caméra. Les couleurs, l'épaisseur réglable et Undo / Redo restent prévus
pour les itérations suivantes.

# Handfinity Paint — V1.1

Application Vue 3 permettant de dessiner avec l'index pendant un pincement
pouce-index. Depuis la racine du monorepo :

```bash
npm run dev -w paint
```

## Réglages du pinceau

- **Color** ouvre le sélecteur de couleur. La couleur initiale est le bleu `#38bdf8`.
- **Width** règle l'épaisseur de 1 à 40 pixels, avec une valeur initiale de 6 pixels.
  Ces pixels correspondent à l'image exportée ; l'affichage du dessin s'adapte
  à la taille disponible à l'écran.
- L'aperçu sur fond quadrillé montre les réglages sélectionnés pour le prochain trait.
- Chaque trait conserve la couleur et l'épaisseur choisies au début du pincement,
  même si les réglages changent pendant le dessin. Les traits précédents restent identiques.
- Les réglages sont conservés lors d'un effacement et d'un arrêt/reprise de la caméra,
  jusqu'au rechargement de la page. L'export PNG conserve les couleurs et les épaisseurs.

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

## Undo / Redo

- **Undo** annule le dernier trait complet. **Redo** le rétablit avec ses points
  lissés, sa couleur et son épaisseur d'origine, indépendamment des réglages actuels.
- Les boutons sont désactivés pendant un pincement et l'initialisation de la caméra.
  Relâcher les doigts permet de les utiliser.
- Un nouveau trait après Undo remplace la suite annulée : les anciens traits
  annulés ne sont alors plus disponibles avec Redo.
- **Clear** est une action annulable : un seul Undo restaure tout le dessin effacé.
  Si Clear interrompt un trait, sa partie déjà tracée est également conservée.
  Il faut relâcher puis pincer à nouveau pour dessiner après Clear.
- Effacer un dessin déjà vide n'ajoute pas d'action à l'historique.
- L'historique reste disponible lorsque la caméra est arrêtée ou redémarrée.
  Les positions normalisées permettent de redessiner les traits si la résolution
  vidéo change. Les épaisseurs restent exprimées en pixels de l'image exportée.
- L'historique reste en mémoire dans l'onglet et disparaît au rechargement de la page.
  L'export PNG représente le dessin actuellement visible après les annulations.

## Retour visuel du geste

- Le statut distingue la caméra arrêtée, son démarrage, l'attente d'une main,
  la main prête à dessiner, le tracé actif et la perte de suivi.
- Le curseur est un cercle vide au repos. Au début du trait, il s'agrandit,
  affiche un halo vert et un centre de la couleur du trait en cours. Une
  modification du pinceau pendant le tracé ne change pas cette couleur.
- Après **Clear** pendant un pincement, le curseur devient pointillé et ambré.
  Le message **Release to continue** invite à relâcher avant de dessiner à nouveau.
- Le curseur disparaît quand la main n'est plus suivie. **Tracking lost** signale
  cette interruption ; **Show one hand** s'affiche avant la première détection
  de la session. Les délais de détection et la tolérance de perte restent identiques.
- Les états sont accompagnés d'une consigne textuelle annoncée aux lecteurs
  d'écran. La courte transition de taille du curseur respecte la préférence
  de réduction des animations ; sa position reste synchronisée avec le pinceau.
- Ces indications restent dans l'interface et ne sont pas incluses dans l'export PNG.

## Perte de suivi

Une absence de main peut être tolérée jusqu'à 120 ms depuis la dernière détection.
La reprise n'est autorisée que si l'index et le poignet restent proches de leur
ancienne position (au plus une demi-longueur de paume). Une reprise éloignée,
une absence prolongée, une vidéo figée ou deux mains détectées terminent le trait.
Un nouveau pincement doit ensuite être confirmé pour commencer un autre trait.

Ces délais utilisent l'horloge du navigateur. Leur observation reste limitée
par la cadence réelle de la caméra et du traitement.

## Organisation du code

Les cinq itérations de V1.1 sont implémentées : tracé lissé, réglages du pinceau,
Undo / Redo, retour visuel et refactoring.

| Fichier | Responsabilité |
| --- | --- |
| `src/App.vue` | Assemble l'interface et fournit les références de la vidéo et des Canvas avec `useTemplateRef`. |
| `src/composables/usePaint.ts` | Gère la session caméra, le filtrage du pointeur, les gestes et la libération des ressources. |
| `src/composables/useDrawingCanvas.ts` | Gère les traits, leur rendu, l'historique, le redimensionnement et l'export. Les points reçus sont déjà lissés et adaptés au miroir. |
| `src/components/BrushControls.vue` | Affiche et modifie les réglages du pinceau via deux `v-model`. |
| `src/components/GestureCursor.vue` | Affiche le curseur selon la position et l'état reçus. |
| `src/lib/brush.ts` | Centralise le type, les valeurs initiales et les limites du pinceau. |
| `src/lib/gesture-feedback.ts` | Déduit le statut et la consigne à afficher à partir de l'état de Paint. |
| `src/lib/drawing-history.ts`, `smooth-stroke.ts`, `point-smoother.ts` | Contiennent les fonctions indépendantes de Vue pour l'historique, les courbes et le filtrage. |

La disponibilité d'Undo / Redo est calculée au même endroit pour les boutons et
les commandes. Chaque instance possède son propre dessin et sa propre session.
La destruction du composable ferme la session, même si son initialisation
se termine après la fermeture de l'application.

## Vérifications

```bash
npm test
npm run lint
npm run format:check
npm run build
```

Les tests couvrent le filtrage, la terminaison des traits, l'historique,
les transitions du pincement, les interruptions de suivi et le cycle de vie de
Paint : démarrage concurrent, fermeture pendant l'initialisation, arrêt pendant
un trait, erreur de suivi et reprise après erreur caméra.
La CI exécute les suites de Paint, core et vision.

Pour valider le ressenti avec une webcam : dessiner un point, un petit trait,
une ligne lente puis un cercle rapide ; relâcher en mouvement ; masquer brièvement
la main puis la faire réapparaître près et loin de sa position ; introduire une
seconde main. Vérifier aussi Clear, l'export pendant un trait et l'arrêt/reprise
de la caméra. Pour les réglages du pinceau, dessiner plusieurs traits de couleurs
et d'épaisseurs différentes, modifier les réglages pendant un pincement et vérifier
que seul le prochain trait adopte le nouveau style, y compris dans l'export PNG.
Pour l'historique, vérifier plusieurs annulations/rétablissements, Clear puis Undo,
Clear pendant un trait, un nouveau trait après Undo, l'export après restauration
et l'arrêt/reprise de la caméra. Pour le retour visuel, observer le curseur et le
statut avant/après un pincement, pendant une perte de suivi et après Clear sans
relâcher les doigts. Vérifier aussi le démarrage et une erreur caméra.

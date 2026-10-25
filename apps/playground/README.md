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

- **Images processed** : nombre de nouvelles images analysées et transmises au
  moteur, même sans main détectée. Une image répétée n'augmente pas ce compteur ;
  l'arrêt le remet à zéro. Il permet de vérifier le suivi indépendamment des
  commandes, qui restent absentes lorsqu'aucune main ne pointe.
- **Hand identities** : numéros, latéralité, état `tracked` ou `missing`,
  dernière apparition/perte et indication d'ambiguïté. Les numéros sont des
  identités locales au suivi, sans reconnaissance persistante des mains.
- **Hand poses** : postures confirmées et candidates, état de confirmation,
  estimation de chaque doigt et ratio de pincement.
- **Hand pointers** : numéro principal ou secondaire, état `active` ou `resting`
  et coordonnées normalisées de l'index avant miroir.
- **Main hand** : choix automatique ou manuel d'une identité. Le curseur plein
  désigne la main principale et le pointillé la seconde main.
- **Pointer commands** : curseur simulé, destination normalisée, compteur total
  et journal des huit dernières commandes `pointer:move`, de la plus récente
  à la plus ancienne.

Pour activer un pointeur : tendre l'index, replier majeur, annulaire et
auriculaire et garder le pouce séparé du bout de l'index. Un pincement ou une
ouverture des cinq doigts retire le curseur après la transition de posture.
Les identités et leurs diagnostics restent visibles tant que les mains sont suivies.

Le pointage et l'ouverture des cinq doigts demandent 80 ms de stabilité. Le
pincement utilise des confirmations de 40 ms à la fermeture et 60 ms au
relâchement. Les mesures sont géométriques ; elles dépendent de la visibilité
des doigts et ne constituent pas une confiance globale de reconnaissance.

La première main en pointage devient principale ; à égalité, le plus petit
numéro gagne. Elle garde son rôle pendant le repos et une absence brève tant
que son identité existe. Une perte définitive relance le choix automatique.
Une ambiguïté termine les identités concernées et efface le choix principal.
Ces règles décrivent le diagnostic actuel du moteur commun ; les règles de
contrôle du PC restent à définir et à vérifier.

Seule la main principale en pointage confirmé produit des commandes, à partir
de ses nouvelles observations. Le moteur applique le miroir horizontal :
**Destination x = 1 − Source x**, **Destination y = Source y**. La destination
est normalisée entre 0 et 1, avec l'origine en haut à gauche de la zone simulée.
La simulation utilise directement les commandes et ne reconnaît aucun geste.
Sans nouvelle commande, son curseur garde sa dernière position, y compris
au repos ou après une perte. Un pincement confirmé n'envoie aucun clic.

## Cycle de vie

`createTrackingSession` possède la caméra, le détecteur, la boucle vidéo et le
suivi des identités. Seules les nouvelles images alimentent la détection.
L'expiration des identités continue sans nouvelle image tant que la boucle tourne.

`createGestureEngine` dans `@handfinity/interactions` assemble les postures et
les pointeurs, sans Vue ni caméra. Le composant principal lui transmet le suivi
et le ratio vidéo avec `update(tracking, aspectRatio)`, puis affiche les résultats
`tracking`, `poses`, `pointers` et `commands`. Il transmet aussi le choix principal via
`setPrimaryHand(id)` et réinitialise l'interprétation avec `reset()` à l'arrêt.
Le moteur ne crée pas de second suivi d'identités.

Chaque résultat de la session est traité, même sans nouvelle image : une image
répétée ne confirme pas de posture, n'est pas filtrée à nouveau et n'émet aucune
commande, mais les identités peuvent expirer. Le diagnostic peut conserver une
main jusqu'à son expiration de 120 ms sans produire de nouveau déplacement.
`createPointerSimulation` reçoit uniquement les commandes du moteur ; l'arrêt
efface aussi sa position, son journal et son compteur. L'exécution sur le PC
reste prévue dans la [roadmap](../../docs/roadmap.md).

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
et la remise à zéro commune. Les tests de simulation vérifient l'exécution
directe des destinations, le journal borné, les instantanés et le nettoyage.

## Vérifications manuelles

1. Démarrer la caméra. Tendre l'index, replier les trois autres doigts et garder
   le pouce séparé : **Confirmed: Pointing**, état du pointeur **active**, cercle
   plein près de l'index et curseur dans **Pointer commands**. Le journal doit
   recevoir des `pointer:move` de cette identité. Cela vérifie la chaîne complète.
2. Déplacer lentement la main : le cercle doit suivre l'index et les coordonnées
   **Source x/y** doivent évoluer. Le cercle doit rester aligné avec la vidéo,
   y compris lorsque celle-ci présente des bandes noires. Le curseur simulé doit
   suivre le même sens, avec **Destination x ≈ 1 − Source x** et les mêmes y.
   Le compteur augmente et le journal garde au plus huit entrées : cela vérifie
   le miroir unique et la consommation des commandes.
3. Ouvrir les cinq doigts : **Open palm**, pointeur **resting**, cercle retiré.
   Pincer pouce et index : **Pinch**, sans curseur vidéo actif ni clic. Après
   confirmation, le compteur doit rester fixe et le curseur simulé conserver sa
   position. Repointer pour reprendre : cela vérifie l'arrêt des déplacements.
4. Présenter deux mains séparées en pointage : numéros distincts, cercle plein
   et cercle pointillé. Choisir l'autre numéro dans **Main hand** : les rôles
   doivent s'inverser et les nouvelles commandes porter le nouveau numéro.
   Mettre la principale au repos en gardant l'autre en pointage : son rôle reste
   réservé et le compteur se fige. Cela vérifie que seule la principale commande.
5. Retirer une main environ une seconde puis la ramener : perte de son identité,
   puis nouveau numéro. Rapprocher les mains jusqu'à une ambiguïté puis les
   séparer : les anciens numéros et pointeurs ne doivent pas subsister. Sans
   autre main principale en pointage, la perte et l'ambiguïté doivent figer le
   compteur, sans effacer la dernière position simulée. Cela vérifie les pertes.
6. Répéter trois démarrages/arrêts : diagnostics et vidéo nettoyés à chaque arrêt,
   sans réutiliser les anciens états de posture ou positions lissées. La position
   simulée et le journal doivent être effacés, le compteur ramené à zéro : cela
   vérifie la remise à zéro commune au moteur et à la simulation.
7. Depuis l'accueil intégré, quitter pendant le suivi puis pendant un démarrage
   ralenti : la caméra doit se libérer et rester arrêtée au retour.
8. Refuser l'autorisation caméra : un message d'erreur doit apparaître. Rétablir
   l'autorisation dans le navigateur puis vérifier qu'un démarrage est possible.

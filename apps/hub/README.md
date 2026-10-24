# Handfinity — Accueil

L'accueil présente l'objectif de contrôle du PC et l'état actuel du projet.
Il donne accès au Playground sans ouvrir la caméra ni charger le détecteur
sur la page d'accueil.

Depuis la racine :

```bash
npm run dev
```

| Adresse | Page |
| --- | --- |
| `http://localhost:3000/` | Présentation de Handfinity |
| `http://localhost:3000/playground` | Laboratoire de diagnostic |

Les liens s'utilisent à la souris, au toucher ou au clavier. Une adresse
inconnue affiche la page 404. Le contrôle gestuel du PC n'est pas implémenté.

## Présentation et navigation

L'identité visuelle conserve la main holographique, les lumières, les anneaux
et l'aperçu du suivi des mains. Le bouton de pause suspend l'ambiance et la
parallaxe. La préférence système de réduction des mouvements est prioritaire.

Vue Router charge le laboratoire à la demande via `playground/view`. Les
transitions GSAP sont limitées à leurs vues et nettoyées à leur démontage.
Le focus rejoint le titre après une transition. Aucun écran n'est conservé
en cache : quitter le laboratoire ferme sa session caméra ; y revenir demande
un nouveau démarrage explicite.

| Élément | Responsabilité |
| --- | --- |
| `views/HomeView.vue` | Présentation et lien vers le laboratoire |
| `components/HolographicHand.vue` | Main décorative |
| `components/TrackingPreview.vue` | Aperçu décoratif du suivi |
| `animations/homeAmbience.ts` | Animations de l'accueil |
| `composables/useHomeAnimations.ts` | Pause et parallaxe |
| `composables/usePageTransition.ts` | Transitions et leur nettoyage |
| `composables/useGsapContext.ts` | Contexte GSAP limité à une vue |
| `composables/useMotionPreferences.ts` | Pause et réduction des mouvements |

## Compilation et hébergement

```bash
npm run build -w hub
```

`apps/hub/dist/` contient les deux pages. Il n'est pas nécessaire de servir le
build autonome du laboratoire à côté. L'hébergement doit renvoyer `index.html`
pour les routes ; `nginx.conf` fournit ce fallback. Le Dockerfile compile `hub`
par défaut. HTTPS reste nécessaire pour la webcam hors localhost.

## Vérifications

Les tests du cycle de vie couvrent les transitions interrompues, la pause,
les callbacks différés et la restauration des styles.

```bash
npm test -w hub
npm run build -w hub
```

Dans le navigateur :

1. Ouvrir l'accueil : vérifier le texte de cadrage, la main et le lien Playground.
   La caméra doit rester arrêtée.
2. Ouvrir le laboratoire puis revenir, utiliser Précédent/Suivant et recharger
   directement `/playground` : la navigation doit fonctionner.
3. Démarrer la caméra dans le laboratoire puis revenir à l'accueil : le suivi
   doit s'arrêter. Revenir au laboratoire : la caméra ne doit pas repartir seule.
4. Quitter le laboratoire pendant **Initializing...** : aucune fin tardive
   d'initialisation ne doit réactiver la caméra.
5. Vérifier la navigation au clavier, la pause de l'ambiance, la réduction des
   mouvements et les affichages étroits.
6. Ouvrir une adresse inconnue : vérifier la page 404 et le retour à l'accueil.

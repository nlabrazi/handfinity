# Handfinity Desktop

Application bureau Electron permettant de contrôler le curseur Windows avec les mains via la webcam. Elle dispose de sa propre interface de contrôle et utilise directement `@handfinity/vision` et `@handfinity/engine`.

## Prérequis

- **Windows 11 x64** avec webcam fonctionnelle.
- Développement depuis **WSL2** (avec interopérabilité Windows et `unzip` installés) ou directement sous Windows.

## Commandes

Depuis la racine du dépôt :

```bash
# Compiler et lancer la fenêtre Electron Windows
npm run dev:desktop

# Compiler uniquement (main, preload et renderer)
npm run build:desktop

# Lancer la dernière compilation sans reconstruire
npm run start:desktop

# Exécuter les tests unitaires du bureau
npm test -w desktop
```

Au premier lancement depuis WSL2, `scripts/start.mjs` télécharge le binaire Windows d'Electron dans `%LOCALAPPDATA%\Handfinity\Cache` afin que Chromium s'exécute directement sous Windows et accède à la webcam hôte.

## Gestes et sécurité

1. **Démarrer la caméra** (`Start camera`) : active le suivi à 30 images/s (ordonnancement par timer maintenu même lorsque la fenêtre est réduite ou en arrière-plan).
2. **Activer le pointeur Windows** (`Enable Windows pointer`) :
   - **☝️ 1 doigt (Index)** : Déplacer le curseur.
   - **✌️ 2 doigts (Index + Majeur)** : Clic gauche.
   - **🤟 3 doigts (Index + Majeur + Annulaire)** : Clic droit.
   - **✊ Poing fermé (maintenu 0,6 s avec jauge)** : Saisir & Glisser (*Grab & Drag* piloté par la paume, relâchement à l'ouverture de la main).
   - **🤏 Pincement + Haut/Bas** : Défilement continu type « Joystick ».
   - **🖐️ Paume ouverte (maintenue 1,5 s)** : Pause / Reprise du contrôle.
   - **👐 Paumes jointes puis écartées** : Afficher ou masquer le clavier virtuel en pop-up.
3. **Arrêt d'urgence** : **`Ctrl + Alt + Esc`** (ou `Stop Windows pointer` / `Stop camera` / fermeture de la fenêtre) relâche tout bouton maintenu et désactive immédiatement le contrôle.

## HUD « On-Top » et Clavier virtuel indépendant

- **Affichage au premier plan sans perte de focus** : Deux fenêtres dédiées ultra-transparentes et non-activables (`focusable: false`, `WS_EX_NOACTIVATE`) restant toujours au-dessus des fenêtres Windows sans jamais voler le focus actif de l'application cible.
- **Capsule HUD on-top au milieu de l'écran** :
  - Positionnée en haut au centre de l'écran principal pour une visibilité immédiate sans gêner le travail.
  - S'active automatiquement dès que le contrôle gestuel ou la caméra est actif (même avec la fenêtre principale minimisée ou dans la barre système).
  - Statut en temps réel (`Mode pointeur actif`, `En pause`, etc.).
  - Jauge de progression du poing fermé pour la saisie / glisser-déposer (0,6 s avec pourcentage en direct et état verrouillé).
  - Notifications flash discrètes pour les clics (`✌️ Clic gauche`, `🤟 Clic droit`, touches, défilements).
  - Déplaçable via sa poignée `⠿` et recentrable avec `↺`.
- **Clavier virtuel déplaçable (Draggable)** :
  - Fenêtre dédiée distincte, libérée de tout compartiment de notification.
  - Déplaçable nativement via Windows DWM (`-webkit-app-region: drag`) et souris sur tout l'écran via la poignée `⠿ Glisser pour déplacer le clavier`.
  - Bouton de recentrage `↺ Recentrer` pour repositionner le clavier en bas au centre.
  - Niveaux de transparence ajustables (20 %, 40 %, 70 %) avec flou d'arrière-plan.
  - Touches Azerty / Qwerty, bascule Maj (`⇧`) et fermeture rapide (`✕`).

## Barquette système Windows (System Tray)

- La fermeture de la fenêtre principale (`X`) minimise l'application dans la zone de notification Windows au lieu de la quitter, garantissant la continuité du suivi visuel en arrière-plan.
- L'icône de la barre d'état système fournit le statut en temps réel, permet d'activer/désactiver le pointeur, d'afficher/masquer le HUD on-top, d'ouvrir le clavier virtuel et de quitter proprement l'application.

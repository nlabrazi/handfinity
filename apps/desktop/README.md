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

## Fonctionnement et sécurité

1. **Démarrer la caméra** (`Start camera`) : active le suivi à 30 images/s (ordonnancement par timer maintenu même lorsque la fenêtre est réduite ou en arrière-plan).
2. **Activer le pointeur Windows** (`Enable Windows pointer`) : déplace le curseur physique de l'écran principal lorsque la main de contrôle pointe.
3. **Pause gestuelle** : maintenir la paume ouverte pendant **1,5 seconde** met en pause ou reprend le contrôle du curseur.
4. **Arrêt d'urgence** : **`Ctrl + Alt + Esc`** (ou `Stop Windows pointer` / `Stop camera` / fermeture de la fenêtre) désactive immédiatement le contrôle du curseur.

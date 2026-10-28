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

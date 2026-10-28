<a name="readme-top"></a>

<!-- PROJECT SHIELDS -->
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![ISC License][license-shield]][license-url]
[![LinkedIn][linkedin-shield]][linkedin-url]

<!-- ABOUT THE PROJECT -->
# 🖐️ Handfinity

<p align="center">
  <a href="http://localhost:3000">
    <img src="public/screenshot.png" alt="Handfinity Screenshot" width="100%" height="400" />
  </a>
</p>

### ℹ️ Description

**Handfinity** est une **interface gestuelle par webcam** visant à remplacer la **souris et le clavier sur PC** dans toutes les applications existantes.

- 🧭 **Trois applications complémentaires** :
  - **Accueil (`apps/hub`)** : Page de présentation du produit avec identité visuelle animée et accès au laboratoire.
  - **Vision Playground (`apps/playground`)** : Laboratoire web de diagnostic des identités, postures, pointeurs et commandes simulées.
  - **Handfinity Desktop (`apps/desktop`)** : Application bureau Electron autonome (Windows 11 x64) déplaçant le vrai curseur système en arrière-plan.
- 📦 **Deux packages partagés** :
  - **`@handfinity/vision`** : Acquisition webcam, détection MediaPipe HandLandmarker (GPU avec repli CPU) et session de suivi.
  - **`@handfinity/engine`** : Suivi d'identités à deux mains, reconnaissance 3D des postures, lissage, pause gestuelle et génération de commandes d'entrée.
- ⚡ **Stack technique** : Vue 3, Vite, TypeScript, Tailwind CSS v4, Electron 45, MediaPipe Tasks Vision, Vitest et Biome v2.

Consultez l'[architecture technique](docs/architecture.md) et la [roadmap](docs/roadmap.md) pour le détail des prochaines étapes (SendInput, clics, glisser-déposer, défilement et clavier virtuel).

---

## ⚖️ Confidentialité & Utilisation de la Webcam

1. **Traitement 100 % local** : La webcam et **MediaPipe Tasks Vision** s'exécutent localement dans le navigateur ou dans l'application Electron. Aucune image n'est envoyée vers un serveur.
2. **Contrôle explicite** : **Start camera** démarre la capture ; **Stop camera** libère immédiatement les pistes vidéo et le détecteur. L'application bureau restreint les permissions à la seule vidéo de son origine interne `handfinity://app/`.

---

## 🎮 Moteur de Reconnaissance Gestuelle

Le socle partagé repose sur `@handfinity/vision` et `@handfinity/engine` :

- 🖱️ **Suivi de deux mains (`createHandIdentityTracker`)** : Associe jusqu'à deux mains entre les images, tolère une occultation brève (120 ms) et détecte les croisements ambigus.
- 🎯 **Postures 3D stabilisées (`createHandPoseTracker`)** : Reconnaît `pointing`, `open-palm`, `pinch` (avec hystérésis entrée/sortie) et `unknown` à partir des repères `{ x, y, z }`.
- 📌 **Main de contrôle automatique (`createHandPointerTracker`)** : La main qui pointe prend le contrôle ; si les deux mains pointent, la main déjà active conserve la priorité.
- ⏸️ **Pause volontaire (`createGestureControl`)** : Maintenir la paume ouverte pendant **1,5 seconde** suspend ou reprend l'émission des commandes, avec relâchement obligatoire entre deux basculements.
- ⌨️ **Commandes normalisées (`createGestureEngine`)** : Produit les commandes consommées à l'identique par le simulateur du Playground et par le contrôleur système de Handfinity Desktop.

---

## 🚀 Progression & Roadmap

La feuille de route détaillée est disponible dans [`docs/roadmap.md`](docs/roadmap.md) :

- [x] **Phase 0 — Recadrage & Socle propre**
  - [x] Unification du moteur dans `@handfinity/engine` et vision GPU/CPU dans `@handfinity/vision`
  - [x] Découplage de `apps/desktop` (interface bureau autonome) et conservation de `apps/hub` + `apps/playground`
  - [x] Déplacement du curseur Windows en arrière-plan, sélection automatique de la main et pause gestuelle
- [x] **Phase 1 — Couche d'entrée système Windows (Souris & Clavier)**
  - [x] Clics gauche/droit, maintien de bouton (glisser-déposer), molette, frappe clavier et relâchement de sécurité (`ReleaseAll`)
- [x] **Phase 2 — Ergonomie & précision du pointeur**
  - [x] Ancrage stable sur la paume (`palmPosition`), filtre adaptatif *One Euro Filter* et zone active configurable (`createActiveZoneMapper`)
- [x] **Phase 3 — Modèle gestuel multimodal (Saisir au poing, accords de doigts, Joystick Scroll)**
  - [x] **☝️ 1 doigt** (déplacement), **✌️ 2 doigts** (clic gauche), **🤟 3 doigts** (clic droit), **✊ poing fermé 0,6 s** (saisir & glisser par la paume), **🤏 pincement + haut/bas** (défilement continu joystick)
- [x] **Phase 4 — Clavier virtuel pop-up**
  - [x] Clavier virtuel pop-up modal (`VirtualKeyboard.vue`) déclenchable sur demande via bouton ou geste bimanuel dédié (rapprocher puis écarter les paumes 👐)
- [ ] **Phase 5 — Expérience quotidienne & distribution**
  - [x] Embarquement local des fichiers WASM et du modèle MediaPipe (`npm run setup:assets`) avec repli automatique sur CDN
  - [ ] Barre système (Tray), overlay HUD sans perte de focus et installeur Windows

---

## Utiliser Handfinity

1. **Démarrer la caméra** : cliquer sur **Start camera**.
2. **Contrôler la souris et le clavier avec les gestes** :
   - **☝️ 1 doigt (Index)** : Déplacer le curseur (zone active projetée aux 4 coins).
   - **✌️ 2 doigts (Index + Majeur)** : Clic gauche.
   - **🤟 3 doigts (Index + Majeur + Annulaire)** : Clic droit.
   - **✊ Poing fermé (0,6 s avec jauge)** : Saisir & Glisser (*Grab & Drag* piloté par la paume).
   - **🤏 Pincement + Haut/Bas** : Défilement continu type « Joystick ».
   - **🖐️ Paume ouverte (1,5 s)** : Mettre en pause / reprendre.
   - **👐 Paumes jointes puis écartées** : Afficher ou masquer le clavier virtuel pop-up.
3. **Contrôler Windows (`apps/desktop`)** : cliquer sur **Enable Windows pointer**. Utiliser **Stop Windows pointer** ou **`Ctrl + Alt + Esc`** pour désactiver immédiatement le contrôle.

---

## 💻 Installation & Démarrage

### Prérequis
* **Node.js 24** et npm.
* Une webcam fonctionnelle.
* Pour l'application bureau : **Windows 11 x64** (lancement direct ou depuis WSL2). Voir le [guide Desktop](apps/desktop/README.md).

### Lancer en local

```bash
# 1. Installer les dépendances
npm ci

# 2. Ouvrir l'accueil et le Playground web (http://localhost:3000)
npm run dev

# 3. Lancer l'application bureau Electron Windows
npm run dev:desktop
```

---

## 🛠️ Scripts Disponibles

| Commande | Description |
| :--- | :--- |
| `npm run dev` | Démarre l'accueil (`apps/hub`) et le Playground intégré sur le port 3000 |
| `npm run dev -w playground` | Démarre le Playground autonome sur le port 3002 |
| `npm run dev:desktop` | Compile et lance l'application Electron Windows |
| `npm run build` | Compile les applications web (`playground` et `hub`) |
| `npm run build:desktop` | Compile le processus Electron, le preload et l'interface bureau |
| `npm run start:desktop` | Lance la dernière compilation bureau sans reconstruire |
| `npm run check` | Vérifie le lint, le formatage et l'organisation des imports avec Biome |
| `npm run lint` | Exécute le linter Biome |
| `npm run format` | Formate le code avec Biome |
| `npm test` | Exécute l'ensemble des tests unitaires sur tous les workspaces |

---

## 📄 Licence & Contact

Distribué sous licence **ISC** (voir `package.json`).

- 👤 **Nabil Labrazi** : [Portfolio](https://nabster.dev) • [LinkedIn](https://linkedin.com/in/nabil-labrazi) • [Email](mailto:na.labrazi@gmail.com)

[contributors-shield]: https://img.shields.io/github/contributors/nlabrazi/handfinity.svg?style=for-the-badge
[contributors-url]: https://github.com/nlabrazi/handfinity/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/nlabrazi/handfinity.svg?style=for-the-badge
[forks-url]: https://github.com/nlabrazi/handfinity/network/members
[stars-shield]: https://img.shields.io/github/stars/nlabrazi/handfinity.svg?style=for-the-badge
[stars-url]: https://github.com/nlabrazi/handfinity/stargazers
[issues-shield]: https://img.shields.io/github/issues/nlabrazi/handfinity.svg?style=for-the-badge
[issues-url]: https://github.com/nlabrazi/handfinity/issues
[license-shield]: https://img.shields.io/badge/License-ISC-blue.svg?style=for-the-badge
[license-url]: https://github.com/nlabrazi/handfinity/blob/master/package.json
[linkedin-shield]: https://img.shields.io/badge/-LinkedIn-black.svg?style=for-the-badge&logo=linkedin&colorB=555
[linkedin-url]: https://linkedin.com/in/nabil-labrazi

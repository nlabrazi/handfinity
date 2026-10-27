# Architecture Handfinity

## Vue d'ensemble

Handfinity transforme le flux d'une webcam en commandes d'entrée PC (souris et clavier) sans contact.

```text
packages/
  vision/     Acquisition webcam, MediaPipe HandLandmarker (GPU avec repli CPU), boucle de suivi
  engine/     Suivi d'identités (2 mains), postures 3D, lissage, contrôle (pause), commandes d'entrée
apps/
  desktop/    Application Electron (Windows 11 x64 en priorité) : contrôle système + interface dédiée
  playground/ Laboratoire de diagnostic et de simulation des commandes dans le navigateur
  hub/        Site vitrine / page d'accueil donnant accès au Playground
```

## Chaîne de traitement

```text
Webcam → @handfinity/vision (HandObservation[] + HandTrackingFrame)
       → @handfinity/engine (poses → pointers → control → commands)
       ├── apps/playground : simulation visuelle et diagnostics
       └── apps/desktop    : IPC → contrôleur système → pointeur/clavier OS
```

### 1. `@handfinity/vision`

- **`camera.ts`** : ouverture et fermeture explicites de `getUserMedia({ video: true, audio: false })`.
- **`hand-tracker.ts`** : wrapper autour de `HandLandmarker` (MediaPipe Tasks Vision). Tente l'initialisation avec `delegate: "GPU"` puis bascule automatiquement sur `delegate: "CPU"` en cas d'indisponibilité WebGL. Convertit chaque main détectée en `HandObservation` immuable (21 repères normalisés `{ x, y, z }`, latéralité et score).
- **`tracking-session.ts`** : orchestre la caméra, le détecteur et le suivi d'identités (`createHandIdentityTracker`). Supporte deux modes d'ordonnancement :
  - `requestAnimationFrame` (par défaut sur le web) ;
  - `scheduling: "timer"` (budget de `1000 / 30` ms) pour maintenir le suivi lorsque la fenêtre Electron est réduite ou en arrière-plan.

### 2. `@handfinity/engine`

Package pur TypeScript, sans dépendance DOM, Vue ou Electron :

- **`tracking/hand-identity-tracker.ts`** : associe jusqu'à 2 mains d'une image à l'autre par proximité spatiale, taille de paume et latéralité. Tolère une perte brève (120 ms) et signale les croisements ambigus.
- **`poses/hand-pose-tracker.ts`** : classifie chaque main suivie en `pointing`, `open-palm`, `pinch` ou `unknown` à partir des angles articulaires 3D corrigés du ratio d'image et de la distance pouce-index normalisée par la paume, avec confirmation temporelle (80 ms pour pointage/paume, 40 ms / 60 ms avec hystérésis pour le pincement).
- **`pointer/one-euro-filter.ts`, `pointer/active-zone.ts`, `pointer/point-smoother.ts` & `pointer/hand-pointers.ts`** : filtre la position du pointeur et calcule le centre stable de la paume (`palmPosition`, moyenne des repères `[0, 5, 9, 13, 17]` filtrée par *One Euro Filter*), projette la zone active confortable vers l'écran et sélectionne automatiquement la main de contrôle.
- **`gestures/pointer-actions.ts`** : implémente le modèle gestuel multimodal sans dérive du curseur :
  - **✊ Poing fermé maintenu 600 ms (`GRAB_HOLD_MS`)** : Saisir & Glisser (*Grab & Drag*) avec jauge de progression (`grabProgress`), verrouillage `pointer:down`, déplacement fluide piloté par le centre de la paume (`palmPosition`) et relâchement automatique `pointer:up` à l'ouverture de la main ou en cas de perte de suivi.
  - **✌️ 2 doigts tendus (Index + Majeur, `CHORD_HOLD_MS = 140 ms`)** : Clic gauche (`pointer:click`, `button: "left"`), curseur figé.
  - **🤟 3 doigts tendus (Index + Majeur + Annulaire, `CHORD_HOLD_MS = 140 ms`)** : Clic droit (`pointer:click`, `button: "right"`), curseur figé.
  - **🤏 Pincement maintenu (`SCROLL_HOLD_MS = 100 ms`) + écart vertical** : Défilement continu type « Joystick » (`pointer:scroll`), vitesse proportionnelle à l'écart vertical de la paume hors de la zone morte (`SCROLL_DEADZONE`).
- **`control/gesture-control.ts`** : bascule la pause/reprise après un maintien de `open-palm` pendant 1 500 ms avec obligation de relâcher le geste avant un nouveau basculement.
- **`gesture-engine.ts` & `commands.ts`** : assemble l'ensemble du pipeline et émet les commandes normalisées (`PointerMoveCommand` et `PointerActionCommand`, avec miroir horizontal déjà appliqué).

### 3. `apps/desktop`

Application Electron isolée de `apps/playground` :

- **Processus `main`** (`src/main.ts`, `src/pointer-controller.ts`, `src/windows-pointer.ts`) :
  - Fenêtre avec `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, protocole `handfinity://app/` et permissions restreintes à la seule webcam vidéo.
  - Maintien des performances du renderer en arrière-plan (`disable-renderer-backgrounding`, `backgroundThrottling: false`, désactivation d'EcoQoS sur le processus de vision Windows).
  - Raccourci global d'arrêt d'urgence `Ctrl + Alt + Esc`.
  - Contrôleur système interpolant les cibles à 120 Hz, exécutant les clics gauche/droit, le maintien de bouton (glisser-déposer), la molette et la frappe clavier (`mouse_event`, `keybd_event`, `VkKeyScanW`), avec relâchement inconditionnel (`ReleaseAll`) en cas de pause, perte de suivi, expiration (250 ms) ou fermeture.
- **Processus `renderer`** (`src/renderer/App.vue`, `src/renderer/components/VirtualKeyboard.vue`) : interface de contrôle bureau dédiée consommant directement `@handfinity/vision` et `@handfinity/engine`, avec jauge de saisie (poing fermé) et clavier virtuel intégré.

### 4. `apps/hub` & `apps/playground`

- **`apps/hub`** : page de présentation / landing page avec animations GSAP et accès à `/playground`.
- **`apps/playground`** : laboratoire web permettant d'inspecter les identités, postures, ratios de pincement et commandes simulées sans toucher au curseur du système.

# Roadmap Handfinity

Objectif : remplacer la souris et le clavier sur PC par le suivi des mains à la webcam (Windows 11 x64 en priorité via Electron, puis Linux).

---

## Phase 0 — Recadrage & Socle propre ✅

- [x] Fusionner `@handfinity/core` et `@handfinity/interactions` dans `@handfinity/engine`.
- [x] Découpler `apps/desktop` de `apps/playground` (interface bureau autonome).
- [x] Activer la délégation GPU MediaPipe avec repli automatique sur CPU.
- [x] Conserver `apps/hub` comme page de présentation et `apps/playground` comme laboratoire de test.
- [x] Nettoyer la documentation technique et la feuille de route.

---

## Phase 1 — Couche d'entrée native (`SendInput`)

Remplacer le sous-processus PowerShell (`SetPhysicalCursorPos`) par une couche d'entrée native directe dans le processus `main` Electron (FFI Win32 `SendInput` via `koffi`) :

- [ ] Définir le contrat `InputDriver` :
  - `moveAbsolute(x, y)` / `moveRelative(dx, dy)`
  - `mouseButton(button: "left" | "right" | "middle", state: "down" | "up")`
  - `scroll(dx, dy)`
  - `key(code, state: "down" | "up")` et `typeText(text)`
  - `releaseAll()` (relâchement inconditionnel de tous les boutons et modificateurs enfoncés)
- [ ] Implémenter le driver Win32 `SendInput` et supprimer le script PowerShell persistant.
- [ ] Garantir l'appel automatique à `releaseAll()` sur pause, perte de suivi, désactivation, arrêt d'urgence (`Ctrl + Alt + Esc`) ou fermeture.

---

## Phase 2 — Ergonomie & précision du pointeur

Corriger les problèmes ergonomiques qui gênent le clic et l'accès aux bords de l'écran :

- [ ] **Point d'ancrage stable** : ancrer le curseur sur le centre de la paume / articulations MCP plutôt que sur le bout de l'index (qui bouge lors d'un pincement).
- [ ] **Filtre adaptatif (One Euro Filter)** : remplacer le lissage exponentiel fixe par un filtre adaptatif (très stable à basse vitesse pour viser, très réactif en déplacement rapide).
- [ ] **Zone active & gain** : projeter un sous-rectangle confortable du champ caméra vers l'écran entier pour atteindre facilement les 4 coins sans tendre le bras.
- [ ] **Mode embrayage (clutch)** : permettre de figer le curseur (ex. poing fermé) pour repositionner sa main.

---

## Phase 3 — Clics, glisser-déposer et défilement

Étendre `@handfinity/engine` avec une machine à états d'entrée complète :

- [ ] **Stabilisation au clic** : geler ou freiner légèrement la position du pointeur au début d'un pincement pour éviter tout dérapage du curseur pendant le clic.
- [ ] **Clic gauche & double-clic** : pincement pouce + index bref (`pointer:down` → `pointer:up`).
- [ ] **Glisser-déposer (drag & drop)** : pincement pouce + index maintenu avec déplacement, puis relâchement.
- [ ] **Clic droit** : pincement pouce + majeur (ou geste secondaire dédié).
- [ ] **Défilement (scroll)** : geste dédié avec contrôle de vitesse et arrêt net.

---

## Phase 4 — Clavier virtuel sans perte de focus

Permettre la saisie de texte dans n'importe quelle application active :

- [ ] **Intégration rapide** : commande gestuelle pour ouvrir/fermer le clavier visuel système ou l'overlay clavier.
- [ ] **Clavier overlay Handfinity** : fenêtre Electron transparente toujours au premier plan avec `focusable: false` (ne vole jamais le focus à l'application cible).
- [ ] **Saisie et édition** : frappe de caractères Unicode via `SendInput`, touches d'édition (`Entrée`, `Retour arrière`, `Espace`, `Tab`, flèches) et modificateurs (`Maj`, `Ctrl`, `Alt`) avec relâchement garanti.

---

## Phase 5 — Expérience quotidienne & distribution

- [ ] Icône dans la barre système (System Tray) et retour visuel léger en surimpression (HUD/overlay).
- [ ] Persistance des réglages utilisateur (sensibilité, zone active, main préférée).
- [ ] Embarquement local des fichiers WASM et du modèle MediaPipe pour un fonctionnement 100 % hors-ligne.
- [ ] Packaging Windows distribuable (`electron-builder`).
- [ ] Adaptation du driver système pour Linux (`uinput`).

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

## Phase 1 — Couche d'entrée système Windows (Souris & Clavier) ✅

- [x] Étendre le driver Windows (`apps/desktop/src/windows-pointer.ts`) avec le support complet de la souris (`DOWN left|right`, `UP left|right`, `CLICK left|right`, `SCROLL <delta>`) et du clavier (`KEY <token>` via `VkKeyScanW` / `keybd_event`).
- [x] Garantir le relâchement inconditionnel (`ReleaseAll` dans le bloc `finally` et commande `RELEASE`) sur pause, perte de suivi, désactivation, arrêt d'urgence (`Ctrl + Alt + Esc`) ou fermeture.
- [ ] Optionnel : migration future vers FFI natif (`koffi` + `SendInput`) lors de l'étape de packaging binaire.

---

## Phase 2 — Ergonomie & précision du pointeur ✅

Corriger les problèmes ergonomiques qui gênent le clic et l'accès aux bords de l'écran :

- [x] **Point d'ancrage stable sur la paume** : calculer et filtrer `palmPosition` (moyenne des repères `[0, 5, 9, 13, 17]`) pour découpler les déplacements de la main des mouvements des doigts.
- [x] **Filtre adaptatif (One Euro Filter)** : implémenter `createOneEuroFilter` (très stable à basse vitesse pour viser, très réactif en déplacement rapide).
- [x] **Zone active & gain** : projeter un sous-rectangle confortable du champ caméra (`createActiveZoneMapper`) vers l'écran entier pour atteindre facilement les 4 coins sans tendre le bras.

---

## Phase 3 — Clics par accords de doigts, Saisir & Glisser au poing et Défilement Joystick ✅

Modèle gestuel multimodal dans `@handfinity/engine` (`createPointerActionTracker`) :

- [x] **Stabilisation immédiate au geste** : figer instantanément la position du curseur dès le début d'un geste d'action (poing, accord à 2 ou 3 doigts, pincement).
- [x] **Clic gauche (`✌️ 2 doigts`)** : index + majeur tendus (`CHORD_HOLD_MS = 140 ms`) avec réarmement obligatoire.
- [x] **Clic droit (`🤟 3 doigts`)** : index + majeur + annulaire tendus (`CHORD_HOLD_MS = 140 ms`) sans déclencher de faux clic gauche pendant la transition.
- [x] **Saisir & Glisser (`✊ Poing fermé 600 ms`)** : verrouillage progressif avec jauge visuelle (`grabProgress`), déplacement piloté par la paume (`palmPosition`) et relâchement automatique à l'ouverture de la main.
- [x] **Défilement continu type « Joystick » (`🤏 Pincement + Haut/Bas`)** : point d'ancrage vertical avec zone morte (`SCROLL_DEADZONE`) et défilement continu proportionnel à l'écart vertical.

---

## Phase 4 — Clavier virtuel ✅

Permettre la saisie de texte et les touches d'édition :

- [x] **Clavier virtuel intégré (`VirtualKeyboard.vue`)** : disposition AZERTY complète, pavé directionnel et touches d'édition (`Space`, `Backspace`, `Enter`, `Tab`, `Esc`).
- [ ] **Fenêtre overlay dédiée sans perte de focus** : fenêtre Electron transparente toujours au premier plan avec `focusable: false`.

---

## Phase 5 — Expérience quotidienne & distribution

- [ ] Icône dans la barre système (System Tray) et retour visuel léger en surimpression (HUD/overlay).
- [ ] Persistance des réglages utilisateur (sensibilité, zone active, main préférée).
- [ ] Embarquement local des fichiers WASM et du modèle MediaPipe pour un fonctionnement 100 % hors-ligne.
- [ ] Packaging Windows distribuable (`electron-builder`).
- [ ] Adaptation du driver système pour Linux (`uinput`).

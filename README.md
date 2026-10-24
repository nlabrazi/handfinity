# Handfinity

**Utiliser son PC avec les mains pour remplacer progressivement la souris et le clavier.**

Handfinity est un projet d'interface gestuelle. La première priorité est le
contrôle des applications existantes sur PC : pointeur, clics, déplacement,
défilement et clavier virtuel invoqué à la demande. Le smartphone, puis les
lunettes de réalité augmentée, seront étudiés après validation de cet usage.

## État actuel

Le dépôt contient un accueil web et un laboratoire de diagnostic. **Le contrôle
de la souris et du clavier du système n'est pas encore implémenté.**

| Élément | Rôle actuel |
| --- | --- |
| [Accueil](apps/hub/README.md) | Présenter Handfinity et donner accès au laboratoire. |
| [Playground](apps/playground/README.md) | Observer la caméra, les identités, les postures et les pointeurs. |
| `@handfinity/core` | Modèles, suivi des identités, reconnaissance des postures et lissage. |
| `@handfinity/vision` | Caméra et session de détection MediaPipe dans le navigateur. |
| `@handfinity/interactions` | Pointeurs normalisés et choix de la main principale. |

La chaîne complète d'interprétation reste à centraliser. Le laboratoire assemble
aujourd'hui les briques partagées ; la production de commandes et leurs
exécuteurs simulé et système sont les prochaines étapes.

Le [cadrage technique](docs/architecture.md) distingue l'existant de
l'architecture visée. La [roadmap](docs/roadmap.md) détaille le découpage du travail.
Windows est la première cible PC proposée ; la technologie bureau et
l'environnement de validation restent à confirmer avant son développement.

## Développement local

Prérequis : **Node.js 24**, npm, une webcam et un navigateur récent.
L'accès caméra nécessite localhost ou HTTPS.

```bash
npm ci
npm run dev
```

| Adresse | Interface |
| --- | --- |
| `http://localhost:3000/` | Accueil |
| `http://localhost:3000/playground` | Laboratoire intégré |

Pour lancer uniquement le laboratoire :

```bash
npm run dev -w playground
# http://localhost:3002
```

L'accueil n'active pas la webcam. Dans Playground, cliquer sur **Start camera**
puis autoriser son accès. Quitter la page ou cliquer sur **Stop camera** ferme
la session. Le cercle affiché dans la vidéo est un diagnostic local du pointeur.

## Développement avec Docker

```bash
docker compose up --build hub
```

Le service `hub` donne accès à l'accueil et au laboratoire sur le port 3000.
Le service autonome `playground`, facultatif, écoute sur le port 3002 :

```bash
docker compose up --build playground
```

Les sources sont montées en volume et Vite utilise le polling pour le hot reload.
Chaque service possède son volume de dépendances et exécute `npm ci` au démarrage.
Après un changement des dépendances ou de la configuration :

```bash
docker compose up -d --build --force-recreate hub
```

Ces conteneurs servent au développement des interfaces web et du socle partagé.
Ils ne constituent pas une application de contrôle du PC hôte.

## Vérifications

```bash
npm test
npm run lint
npm run format:check
npm run build
```

Vitest vérifie le suivi, les postures, le lissage, les pointeurs, les sessions
caméra et le cycle de vie des transitions de page. Jenkins installe les
dépendances, lance ces vérifications et compile les deux interfaces web.

La reconnaissance réelle doit également être vérifiée avec la webcam.
Les [vérifications manuelles du laboratoire](apps/playground/README.md#vérifications-manuelles)
précisent les gestes et résultats attendus.

## Compilation et hébergement web

`npm run build` compile le laboratoire autonome puis l'accueil intégré.
`apps/hub/dist/` contient l'accueil et le laboratoire ; `apps/playground/dist/`
contient le laboratoire seul. Un serveur de fichiers statiques peut les servir.

Le Dockerfile conserve une cible de production web :

```bash
docker build --target prod -t handfinity-web .
# Variante autonome : ajouter --build-arg APP=playground
```

La cible par défaut est `hub`. Nginx renvoie `index.html` pour permettre le
rechargement direct de `/playground`. Pour un accès public à la caméra, HTTPS
doit être configuré par l'hébergement ; l'image seule ne configure pas TLS.
Cette distribution concerne les interfaces web, pas le futur programme bureau.

## Caméra et données

Les images sont traitées dans le navigateur. Aucun enregistrement vidéo ni
envoi des images à un serveur applicatif n'est implémenté. Le démarrage du
suivi télécharge les fichiers MediaPipe et le modèle depuis leurs hébergements
externes. La caméra reste sous contrôle explicite de l'utilisateur.

## Licence et contact

Le projet indique la licence ISC dans `package.json` ; aucun fichier de licence
dédié n'est présent à la racine.

Nabil Labrazi — [Portfolio](https://nabster.dev) ·
[LinkedIn](https://linkedin.com/in/nabil-labrazi) ·
[Email](mailto:na.labrazi@gmail.com)

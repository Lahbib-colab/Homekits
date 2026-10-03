# Ma maison — PWA domotique avec maison 3D
**Version 1.6.1 — by Lahbib.AI** (source unique : `js/version.js`, affichée dans le menu, sur l'accueil et à l'écran de démarrage ; pensez à aligner `VERSION` dans `service-worker.js` à chaque publication).

Tableau de bord domotique sombre (verre dépoli) centré sur une **maison 3D interactive**.
Vanilla JS (modules ES), **aucune dépendance** : moteur WebGL2 maison (`js/gl.js`), fonctionne hors ligne.
L'ancien éditeur externe (HomeKit 3D Studio, Three.js) a été **supprimé** : l'éditeur de plan intégré ci-dessous le remplace
(pièces, murs, portes/fenêtres, meubles, étages, escaliers, plan de fond, modèles), avec le même design que l'application.

## Lancer
Servir le dossier en HTTP(S) (le service worker exige HTTPS ou localhost) :
`python3 -m http.server 8080` puis ouvrir `http://localhost:8080/`.
iPhone : Safari → Partager → « Sur l’écran d’accueil ». Android/Desktop : Menu ⋯ → « Installer l’application ».
**Ouvrez l’app une fois en ligne** : le service worker met alors tout en cache. L'application n'a **aucune dépendance externe** (pas de CDN, pas de Three.js).

## Éditeur de plan (nouveau)
**Menu ⋯ → Éditer le plan de la maison** (ou le bouton ✎ sur la maison 3D). Le plan 2D se modifie en bas, la maison 3D se met à jour **en direct** au-dessus.
- **Pièce** : glisser pour tracer ; les bords s'alignent sur les pièces voisines (le mur mitoyen est créé tout seul). Déplacer, redimensionner (8 poignées) ou saisir les **cotes exactes** en mètres. Sol **parquet / carrelage / lino / béton** avec **couleur personnalisable** (nuanciers + sélecteur libre), icône, résumé affiché.
- **Porte / fenêtre** : toucher un mur ; portes, porte d'entrée, fenêtres (volet roulant motorisé en option), baie vitrée, porte de garage. Glisser pour les déplacer le long du mur, régler largeur/hauteur/allège.
- **Meuble** : bibliothèque de 29 éléments dont **Lit simple / Lit double**, **douche** en 6 dimensions (80×80 → 160×90 cm, réglable) et **armoire redimensionnable** (largeur, profondeur, hauteur, nombre de portes ; portes **battantes ou coulissantes**, finition **miroir**, couleur libre) ; rotation, duplication ; lampadaires/chevets/bornes créent une **lumière pilotable**.
- **Sol ext.** : allées, terrasses, parking, gravier, **pelouse** et **haies / buissons** (rangée de buissons le long du rectangle tracé, même très étroit). **Appareils** : glisser pour placer lumières, capteurs, caméras.
- **Fond** : importer une photo/plan de votre vraie maison, régler sa largeur réelle, tracer par-dessus.
- **Modèles** : plan vide, T2 meublé, villa ; **Équiper les pièces** ajoute lumière + thermostat ; annuler/rétablir illimité (60 pas) ; tout est sauvegardé et exportable.
- **Murs libres** : touchez n'importe quel mur pour le passer en **Plein / Demi-mur / Ouvert (sans mur)** — c'est ainsi qu'on fait un **salon avec cuisine ouverte** (les deux pièces restent distinctes pour les appareils). L'outil **Mur** trace des cloisons libres (murets, séparations partielles) sans lien avec les pièces.
- **Étages** : boutons de niveaux (RDC / Étage 1 / Étage 2, 3 max). Le niveau du dessous apparaît en fantôme pour caler l'étage ; la 3D de l'accueil a un sélecteur de niveau.
- **Escalier** : outil dédié, **droit, en L (angle gauche / droit) ou en U (demi-tour gauche / droit)** avec palier, longueur de chaque volée réglable (montée vers l'étage au-dessus) ; la trémie est percée dans le plancher et des garde-corps sont ajoutés. Modèle « Maison à étage » fourni (cuisine ouverte + escalier).
- **Électroménager connecté** : **lave-vaisselle** (4 programmes, décompte, fin de cycle), **micro-ondes** (minuterie, puissance) et **robot aspirateur intelligent** : on **choisit les pièces sur un plan 2D** dans sa fiche (toucher les pièces ; il franchit portes et murs ouverts, dans l'ordre le plus court), avec en direct le **temps restant**, le **retour à la base**, l'heure de fin estimée, la pièce en cours et le tracé parcouru ; batterie et base de charge (recharge puis reprise automatique dès 80 %) ; pause automatique si un détecteur voit quelqu'un dans sa pièce ; pièces inaccessibles (sans porte) signalées. Pilotables depuis leur fiche, les scénarios (« Je suis parti » lance le robot, « Bonne nuit » le renvoie) et les automatisations (robot en semaine à 10 h 30).
- **Lampes RVB** : couleur libre (curseur de teinte, préréglages, palette) pour tout luminaire marqué RVB ; meubles « Lampe RVB », « Ruban LED RVB », « Plafonnier RVB » ; scène « Ambiance RVB ».
- **Animations** : volets et porte de garage sont des rideaux à lames qui s'enroulent progressivement (3D) avec une maquette animée dans leur fiche ; la simulation suit l'horloge réelle.
Limites : 3 niveaux max, escalier droit, en L ou en U (rotations de 90°, pas de colimaçon), pièces rectangulaires (une pièce en L = 2 rectangles) qui ne se chevauchent pas sur un même niveau, une seule piscine, sols extérieurs et porte de garage au rez-de-chaussée uniquement. Les lampes n'éclairent que leur pièce : près d'une ouverture entre deux pièces, la transition de lumière est nette.

## Structure
| Fichier | Rôle |
|---|---|
| `js/data.js` | **Modèle de données** : house → rooms → devices(state) → scenes → automations (+ décor 3D). JSON pur. |
| `js/catalog.js` | Comportement par type d’appareil (états par défaut, puissance, résumé). |
| `js/store.js` | État, persistance (localStorage), actions, scénarios, moteur d’automatisations, énergie. |
| `js/drivers.js` | **Couche appareils** : `SimulatedDriver` (thermique, garage, détecteurs…) — à remplacer. |
| `js/plan.js`, `js/editor.js` | Opérations sur le plan (testables) et éditeur visuel 2D + aperçu 3D. |
| `js/world.js` | Construit la 3D **à partir des données** (murs déduits des pièces, ouvertures, mobilier). |
| `js/gl.js` | Moteur WebGL2 : éclairage nocturne, halos, murs « maison de poupée », caméra orbitale. |
| `js/house3d.js` | Contrôleur 3D (gestes, pastilles, repères, qualité adaptative) + repli **Plan 2D**. |
| `js/views.js`, `js/sheets.js`, `js/dom.js`, `js/app.js` | Interface : onglets, feuilles de contrôle, éditeurs, démarrage. |
| `js/cams.js` | Flux caméra **simulés** (canvas). |
| `service-worker.js`, `manifest.json`, `icons/` | PWA : cache hors ligne, installation, icônes, écrans de démarrage iPhone/iPad. |
| `tests/` | `node tests/store.test.mjs` (logique), `node tests/world.test.mjs` (géométrie), `node tests/plan.test.mjs` (éditeur/modèles), `node tests/appliances.test.mjs` et `node tests/robot.test.mjs` (électroménager, robot multi-pièces). |

## Modifier les données
Tout se modifie dans l’app (renommer pièce/appareil, ajouter/supprimer un appareil, créer scénarios et
automatisations) ou en **Menu → Exporter / Importer** (JSON). Le décor 3D (`layout.furniture`, `layout.openings`,
rectangles des pièces) est dans le même JSON. Réinitialisation : Menu → Réinitialiser.

## Brancher un vrai système (Home Assistant, MQTT, Matter)
Écrire un driver avec la même interface que `SimulatedDriver` et le passer à `createStore({ driver })` dans `app.js` :
```js
class HADriver {
  attach(store) { this.store = store; this.ws = new WebSocket('ws://HA:8123/api/websocket'); /* auth, subscribe_events */
    this.ws.onmessage = (m) => { /* state_changed → */ store.setDevice(idMap[entity], { on: s.state==='on', brightness: ... }, { source: 'driver' }); }; }
  send(device, patch) { /* appel de service HA : light.turn_on, climate.set_temperature… pour device.id */ }
  // pas de step() : les valeurs continues arrivent via store.patchLive(id, patch)
}
```
Ajouter dans chaque appareil `props.entity` (ex. `light.salon`) pour la correspondance. Caméras : remplacer `drawFeed` (`js/cams.js`) par un `<video>`/`<img>` MJPEG/HLS.

## Limites connues (à connaître)
- Données **simulées** (appareils, énergie historique, caméras) tant qu’aucun driver n’est branché.
- Les automatisations s’exécutent tant que l’app est ouverte (pas de tâche en arrière-plan côté navigateur).
- Testé dans Chromium (émulation iPhone 17, iPad, bureau) ; **non testé sur un vrai Safari iOS** ni mesuré sur GPU mobile.

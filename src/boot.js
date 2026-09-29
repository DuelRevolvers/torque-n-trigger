// The game's page: the game, or (index.html?creator) the T&T Creator, the
// players' map editor. The players' own maps are loaded first, so the game can
// list them.
import { initLibrary } from './content/library.js';

if (new URLSearchParams(window.location.search).has('creator')) {
  import('./sdk/boot.js').then((m) => m.startSdk('creator'));
} else {
  initLibrary().then(() => import('./main.js'));
}

// Starts the T&T SDK on the page: Studio (sdk.html, the owner's) or the
// Creator (the game's page with ?creator, the players'). The page's own style
// and content give way to the SDK's; the edition is read by main.js.
import { SDK_CSS, SDK_HTML } from './page.js';
import { initLibrary } from '../content/library.js';

export async function startSdk(edition) {
  globalThis.TT_EDITION = edition;
  for (const el of document.querySelectorAll('style, link[rel="stylesheet"]')) el.remove();
  const style = document.createElement('style');
  style.textContent = SDK_CSS;
  document.head.append(style);
  document.title = edition === 'creator' ? 'T&T Creator' : 'T&T SDK';
  document.body.innerHTML = SDK_HTML;
  await initLibrary();
  await import('./main.js');
}

import { escapeHtml } from './escape.js';

export interface UnlockPageOptions {
  slug: string;
  /** Hex-encoded PBKDF2 salt — not secret, the client needs it to recompute the verifier. */
  salt: string;
  theme: { backgroundColor: string; logoUrl: string | null } | null;
}

const DEFAULT_BG = '#0f172a';

/** Must match the iteration count in the admin-frontend's pbkdf2.ts. */
const ITERATIONS = 210_000;

/**
 * Server-renders the unlock page: themed shell, a password form, and an
 * inline script that derives the PBKDF2 verifier client-side and posts it to
 * `/_i_/pw/{slug}/verify`. Plain vanilla JS (not bundled) since this is a
 * single small page served directly by the worker.
 */
export function renderUnlockPage(opts: UnlockPageOptions): string {
  const bg = escapeHtml(opts.theme?.backgroundColor ?? DEFAULT_BG);
  const logoUrl = opts.theme?.logoUrl;
  const logoHtml = logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="" class="logo" />` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Password required</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${bg};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 1rem;
  }
  .card {
    background: rgba(255, 255, 255, 0.97);
    border-radius: 12px;
    padding: 2rem;
    width: min(100%, 360px);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    text-align: center;
  }
  .logo { max-width: 160px; max-height: 80px; margin-bottom: 1rem; }
  h1 { font-size: 1.1rem; margin: 0 0 1.25rem; color: #111827; }
  input[type="password"] {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 1rem;
    margin-bottom: 0.75rem;
  }
  button {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: none;
    border-radius: 8px;
    background: #111827;
    color: #fff;
    font-size: 1rem;
    cursor: pointer;
  }
  button:disabled { opacity: 0.6; cursor: default; }
  .error { color: #b91c1c; font-size: 0.875rem; margin: 0 0 0.75rem; min-height: 1.2em; }
</style>
</head>
<body>
  <div class="card">
    ${logoHtml}
    <h1>This link is password protected</h1>
    <form id="unlock-form" data-slug="${escapeHtml(opts.slug)}" data-salt="${escapeHtml(opts.salt)}">
      <p class="error" id="error" role="alert"></p>
      <input type="password" id="password" name="password" placeholder="Password" autofocus required />
      <button type="submit" id="submit">Unlock</button>
    </form>
  </div>
<script>
(function () {
  var ITERATIONS = ${ITERATIONS};

  function toHex(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
    return out;
  }
  function fromHex(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
  }
  async function deriveVerifier(password, saltHex) {
    var key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    var bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: fromHex(saltHex), iterations: ITERATIONS, hash: "SHA-256" },
      key,
      256,
    );
    return toHex(new Uint8Array(bits));
  }

  var form = document.getElementById("unlock-form");
  var errorEl = document.getElementById("error");
  var submitBtn = document.getElementById("submit");
  var slug = form.dataset.slug;
  var salt = form.dataset.salt;

  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    errorEl.textContent = "";
    submitBtn.disabled = true;
    try {
      var password = document.getElementById("password").value;
      var verifier = await deriveVerifier(password, salt);
      var res = await fetch("/_i_/pw/" + encodeURIComponent(slug) + "/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verifier: verifier }),
      });
      if (res.status === 200) {
        var data = await res.json();
        window.location.replace(data.destination);
        return;
      }
      if (res.status === 401) {
        errorEl.textContent = "Incorrect password.";
      } else if (res.status === 404) {
        errorEl.textContent = "This link is no longer available.";
      } else {
        errorEl.textContent = "Something went wrong. Try again.";
      }
    } catch (err) {
      errorEl.textContent = "Something went wrong. Try again.";
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
</script>
</body>
</html>`;
}

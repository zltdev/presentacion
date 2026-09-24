/* Gate de acceso para proyectos.somoszlt.com (raiz y /v2/).
   Client-side sobre un sitio estatico: frena a quien entra por la URL,
   no a quien mire el repo. Reemplazo real: PJW-001.
   Ni los mails ni la clave viajan en claro: sha256(salt+mail+":"+clave). */
(function () {
  var SALT = "zlt-gate-v1-2026";
  var USERS = [
    "df08d8ce0b3e5cc4a02a8a75d5f8459512e02183001d65dd7d64864f66e4bdbb",
    "ebcba71f4ffdd4b8a250dd8fc2ee6e550910a1bea2359fdcdbe0593ce6eb4245",
    "04337204d3c2067b342c52edf3f9c5aba1618d2e2c2e815964552599eaceddf5",
    "fc5dde996f7c480eb025478f7e0a9b8988b16bbf3f6f8837e7da0f586bb3354c",
    "7655a20b7bffe0750c2207be8cad0fb872102078c86ef605d04948e98492c85d",
    "00dfd62886f061cf6fd17606a3ac26f2bbf7fbcd605af4915da99fe7f94e0efd",
    "2de7532ce50b12d616d2ab74dea6e64ac20ac214c050b898b8521a7d6dd09eae"
  ];
  var KEY = "zlt_gate_ok";
  var LOGO = "data:image/webp;base64,UklGRgQFAABXRUJQVlA4TPcEAAAvCUWkEIcgEEjhBicQSOEGJxBI4QanMJIkM3b3to2oAAgKDgkNC4+IjIqOhY2L//8IG0mS2lBLePv/D4tdjLBZRP8nIN1kNv7QRQHs+JuelyDgdgjpUFpyDG3pFSA7nIQ9B9g8JGSHk7DnAJuHBJv7wzlgf2DzkGBzXqls6RHQ9nCQpxONRbQUbt2DhMTIttu2egAEyPr9F5oDE9iAiRHJ63siAhIkybKSYpn40uycUCvwRXsJIdzhP/gP/oP/4D/4D/6D/+A/+A/+g//gP/gP/oP/4D/4D/6D/+A/Xy1J5Z1l/VyUNEbK4e5mOiesg6a83liW6XPxKmPkdbi7Wc4Jv+Ny2M0hg7u+6SBzGEJWRzj3RQmnIWQTwjkJYXrVQRZHmO7dEKZjZuP0JoSTjdMLG0uyJziWZAvhJTvC7b4bwhmzITzEgv+SbHSUZJuJ0/Ffko3/kmw6lmRfYBP/Jdn4L8n2vZJsNF6uKTiWZG9KmLaEkmxPuFxTbCzJ9oTSB1czt3/HJl8+0od/6bC0Nsrn5a36dfz94M/Ra/CS7FPv3ejDfF72OE27en9tn6hD1sF008EfYsx18Gkt2RZCSfZTB9OPrIM0HTyk0aOD6d49VboUHeSpg7/XElUILzkJofRBB2d+DF76oIPpi/Rr+C/JduWS7EkIJdkLXUqyB3/oXQeZhFCSvXgqSXZSQulD0sHlmmqD37aEkmwx+SFGEU/vs6lKhw6mmxBKshsxSbLxX5KN/5Js/Jdkr+EIJdmLq/pE11wvyd5XIUzDsSRbCZcfBI4l2Z5quaby6NN0KcluQijJFsJLznXw23Qpya5CKMmubCzJfgqhJDsbIUk2/kuy8V+Sfa9JsvFfkq0Akmz8l2TjvyR7FkJJ9kKXkuxSRPyHGJfwVDQVX36QWQmXawqOJdme6pKTii/XVN88lST7b+jgj3PPOnhIuw6eu147afyXZOO/JBv/Jdn4L8mOvguhJNsSVozSEi4/SIdjSbaWnFvGK0aJVZJs/K8YJUJXjFIl0vjfh3e078O7mEgfkFCSjf+SbPyXZF9ikmz8l2TjvyQb/yXZ0TchlD7gvyRbJiTZi6uSZJN9H94thyQb//vwDsd9ePdLkmz878O7F+rDO/5LsvFfkn2rSbLxX5KtAJJs/Jdk215JtqeaVFgxSvyvGKXtrRil45Bk438f3tG+D+9acqkV/yXZfkmS/e3+lz7gvyQb/yXZt5EkG/8l2fgvyZ7w/xNde45PdE32FaPUkl91Jsd/3iT878M7Hffh3S5JsvG/D++p4r8km3sl2W9+Gv8l2fgvycZ/SbZ3lGTLeNpxSB/wv2KUjqlilPjfh3ey78O7nUjjfx/e8b8P77sjlGSvdCnJ1glJNv5LshVAko3/kmyElmTLeMUo4fgTXWtJGo4rRikAafyvGCX+V4xy/zg573wf9zW9rhe8JDs3JaHFRb372skjG8KZrmooIl2KDvIUwnTVQWoyhOn8MITpaGycrhf1xH9JNv5LsjFOko3/kmz8l2Q3IUxXOJZkC+HpWQjTbCzJfgqhJDvDsSTbEG7nYghnNB3knxDORQjTgf+SbPyXZNsJSbaZmPgvycZ/SXbzhH8BDxxLsg3hTBWOJdk6yPb9lPL7ZPD/ewjhDv/Bf/Af/Af/wX/wH/wH/8F/8B/8B//Bf/Af/Af/wX/wH/wH/7kjCAA=";
  var root = document.documentElement;

  if (sessionStorage.getItem(KEY) === "1") return;
  root.style.visibility = "hidden";

  async function sha256(txt) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf)).map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  var CSS = [
    "#zgate{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;",
      "padding:24px;overflow:auto;background:#2f2f31;",
      "background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),",
      "linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:38px 38px;",
      "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}",
    "#zgate *{box-sizing:border-box}",
    "#zgate .zg-wrap{width:100%;max-width:382px;text-align:center}",
    "#zgate .zg-logo{width:132px;height:auto;display:block;margin:0 auto 10px}",
    "#zgate .zg-tag{font-size:11px;letter-spacing:.2em;color:#dcdcdc;margin:0 0 34px;font-weight:500}",
    "#zgate .zg-card{background:#1c1c1e;border-top:3px solid #4d8fa0;padding:32px 30px 28px;text-align:left;",
      "box-shadow:0 18px 50px rgba(0,0,0,.45)}",
    "#zgate label{display:block;font-size:11px;letter-spacing:.16em;color:#b9b9b9;margin:0 0 9px;font-weight:600}",
    "#zgate .zg-field{display:flex;margin:0 0 20px;border-radius:3px;overflow:hidden}",
    "#zgate .zg-ico{width:40px;flex:none;display:flex;align-items:center;justify-content:center;background:#4a4a4d}",
    "#zgate .zg-ico svg{width:17px;height:17px;stroke:#e6e6e6;fill:none;stroke-width:1.7}",
    "#zgate input{flex:1;min-width:0;height:41px;border:0;background:#e8eaf1;color:#1b1b1d;",
      "font-size:15px;padding:0 12px;font-family:inherit}",
    "#zgate input:focus{outline:2px solid #4d8fa0;outline-offset:-2px}",
    "#zgate .zg-eye{width:34px;flex:none;border:0;background:#e8eaf1;cursor:pointer;display:flex;",
      "align-items:center;justify-content:center;padding:0}",
    "#zgate .zg-eye svg{width:17px;height:17px;stroke:#6a6a70;fill:none;stroke-width:1.6}",
    "#zgate .zg-eye:hover svg{stroke:#1b1b1d}",
    "#zgate button[type=submit]{width:100%;height:46px;border:0;background:#5c6f7e;color:#fff;",
      "font-size:14px;font-weight:600;letter-spacing:.12em;cursor:pointer;font-family:inherit;border-radius:3px;",
      "transition:background .15s}",
    "#zgate button[type=submit]:hover{background:#6c8194}",
    "#zgate button[type=submit]:disabled{opacity:.6;cursor:default}",
    "#zgate .zg-err{color:#e06c5a;font-size:13px;margin:14px 0 0;min-height:18px;text-align:center}",
    "#zgate .zg-foot{color:#6d8ba0;font-size:13px;line-height:1.7;margin:26px 0 0}",
    "@media(max-width:420px){#zgate .zg-card{padding:26px 20px 24px}}"
  ].join("");

  var ICO_USER = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.6-4 3.7-6 7.5-6s6.9 2 7.5 6"/></svg>';
  var ICO_LOCK = '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="9.5" rx="1.4"/><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7"/></svg>';
  var ICO_EYE = '<svg viewBox="0 0 24 24"><path d="M1.8 12S5.6 5.5 12 5.5 22.2 12 22.2 12 18.4 18.5 12 18.5 1.8 12 1.8 12z"/><circle cx="12" cy="12" r="3"/><path d="M3.5 3.5l17 17"/></svg>';
  var ICO_EYE_ON = '<svg viewBox="0 0 24 24"><path d="M1.8 12S5.6 5.5 12 5.5 22.2 12 22.2 12 18.4 18.5 12 18.5 1.8 12 1.8 12z"/><circle cx="12" cy="12" r="3"/></svg>';

  function build() {
    var hidden = [].slice.call(document.body.children);
    hidden.forEach(function (n) { n.style.display = "none"; });

    var st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);

    var ov = document.createElement("div");
    ov.id = "zgate";
    ov.innerHTML =
      '<div class="zg-wrap">' +
        '<img class="zg-logo" src="' + LOGO + '" alt="ZLT">' +
        '<p class="zg-tag">NEGOCIOS RENTABLES</p>' +
        '<form class="zg-card" novalidate>' +
          '<label for="zgu">EMAIL</label>' +
          '<div class="zg-field">' +
            '<span class="zg-ico">' + ICO_USER + '</span>' +
            '<input id="zgu" type="email" autocomplete="username" autocapitalize="off" spellcheck="false" required>' +
          '</div>' +
          '<label for="zgp">CONTRASEÑA</label>' +
          '<div class="zg-field">' +
            '<span class="zg-ico">' + ICO_LOCK + '</span>' +
            '<input id="zgp" type="password" autocomplete="current-password" required>' +
            '<button type="button" class="zg-eye" id="zge" aria-label="Mostrar contraseña">' + ICO_EYE + '</button>' +
          '</div>' +
          '<button type="submit">Ingresar</button>' +
          '<p class="zg-err" id="zgerr" role="alert" aria-live="polite"></p>' +
        '</form>' +
        '<p class="zg-foot">Si no tenés acceso, contactate con ZLT.</p>' +
      '</div>';
    document.body.appendChild(ov);
    root.style.visibility = "visible";
    ov.querySelector("#zgu").focus();

    var pw = ov.querySelector("#zgp");
    var eye = ov.querySelector("#zge");
    eye.addEventListener("click", function () {
      var show = pw.type === "password";
      pw.type = show ? "text" : "password";
      eye.innerHTML = show ? ICO_EYE_ON : ICO_EYE;
      eye.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
      pw.focus();
    });

    ov.querySelector("form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var btn = ov.querySelector("button[type=submit]");
      var err = ov.querySelector("#zgerr");
      var mail = ov.querySelector("#zgu").value.trim().toLowerCase();
      if (!mail || !pw.value) { err.textContent = "Completá los dos campos."; return; }
      btn.disabled = true;
      var h = await sha256(SALT + mail + ":" + pw.value);
      btn.disabled = false;
      if (USERS.indexOf(h) === -1) {
        err.textContent = "Email o contraseña incorrectos.";
        pw.value = ""; pw.focus();
        return;
      }
      sessionStorage.setItem(KEY, "1");
      st.remove(); ov.remove();
      hidden.forEach(function (n) { n.style.display = ""; });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();

/* Gate temporal para proyectos.somoszlt.com (raiz y /v2/).
   Es client-side sobre un sitio estatico: frena a quien entra por la URL,
   no a quien mire el repo. Reemplazar por login real (ver PJW-001).
   Ni los mails ni la clave viajan en claro: se guarda sha256(salt+mail+":"+clave). */
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
  var root = document.documentElement;

  if (sessionStorage.getItem(KEY) === "1") return;
  root.style.visibility = "hidden";

  async function sha256(txt) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf)).map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  function build() {
    var hidden = [].slice.call(document.body.children);
    hidden.forEach(function (n) { n.style.display = "none"; });

    var ov = document.createElement("div");
    ov.setAttribute("style", "position:fixed;inset:0;z-index:2147483647;background:#0f0f0e;" +
      "display:flex;align-items:center;justify-content:center;padding:20px;" +
      "font-family:system-ui,-apple-system,Segoe UI,sans-serif");
    ov.innerHTML =
      '<form style="display:flex;flex-direction:column;gap:14px;width:min(340px,100%)">' +
        '<div style="color:#c9a227;font-size:11px;letter-spacing:.24em;text-transform:uppercase;font-weight:700">ZLT</div>' +
        '<p style="color:#EDEAE1;font-size:15px;margin:0 0 4px">Ingresá tus datos para ver la presentación</p>' +
        '<label for="zgu" style="color:#8f897c;font-size:12px">Email</label>' +
        '<input id="zgu" type="email" autocomplete="username" autofocus required ' +
          'style="padding:12px 14px;border:1px solid #3a3a37;border-radius:10px;background:#1a1a18;color:#EDEAE1;font-size:16px">' +
        '<label for="zgp" style="color:#8f897c;font-size:12px">Contraseña</label>' +
        '<input id="zgp" type="password" autocomplete="current-password" required ' +
          'style="padding:12px 14px;border:1px solid #3a3a37;border-radius:10px;background:#1a1a18;color:#EDEAE1;font-size:16px">' +
        '<button type="submit" style="padding:12px;border:0;border-radius:10px;background:#c9a227;color:#0f0f0e;font-size:15px;font-weight:700;cursor:pointer">Entrar</button>' +
        '<p id="zgerr" style="color:#e06c5a;font-size:13px;margin:0;min-height:18px" role="alert" aria-live="polite"></p>' +
      '</form>';
    document.body.appendChild(ov);
    root.style.visibility = "visible";

    ov.querySelector("form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var mail = ov.querySelector("#zgu").value.trim().toLowerCase();
      var pass = ov.querySelector("#zgp").value;
      var h = await sha256(SALT + mail + ":" + pass);
      if (USERS.indexOf(h) === -1) {
        ov.querySelector("#zgerr").textContent = "Email o contraseña incorrectos.";
        ov.querySelector("#zgp").value = "";
        ov.querySelector("#zgp").focus();
        return;
      }
      sessionStorage.setItem(KEY, "1");
      ov.remove();
      hidden.forEach(function (n) { n.style.display = ""; });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();

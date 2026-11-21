// Tu llave, sin nosotros: la herramienta. Reconstruye la llave privada de una billetera SERO con
// sero-llave.js (el mismo código de la billetera, MIT). Todo ocurre en este dispositivo: esta página
// no envía nada a ningún servidor. La usan /llave/ y la versión para descargar y usar sin internet.
// Con { red: true } (solo en /llave/) puede además buscar tus cobros en la red pública: descarga
// los pagos del contrato SERO y los reconoce aquí con tu llave, que nunca sale del dispositivo.
export function iniciarHerramienta(llave, raiz, { red = false } = {}) {
  const $ = (selector) => raiz.querySelector(selector);
  const opcion = (lista) => lista.map(({ id, nombre }) => `<option value="${id}">${id}. ${nombre}</option>`).join("");
  const casillas = Array.from({ length: 12 }, (_, i) => `
          <label class="llave-palabra"><span>${i + 1}</span><input data-i="${i}" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="${i === 11 ? "done" : "next"}" aria-label="Palabra ${i + 1}" /></label>`).join("");

  raiz.innerHTML = `
    <form class="llave-form" novalidate>
      <fieldset class="llave-niveles">
        <legend>¿Qué nivel elegiste al activar tu billetera?</legend>
        <label><input type="radio" name="nivel" value="standard" checked /> Estándar</label>
        <label><input type="radio" name="nivel" value="advanced" /> Avanzada</label>
        <label><input type="radio" name="nivel" value="maximum" /> Máxima</label>
      </fieldset>

      <div class="llave-cultural">
        <div class="llave-secreto" data-slot="1">
          <p class="llave-subtitulo">Tu secreto</p>
          <label class="llave-campo"><span>Libro</span><select name="libro1">${opcion(llave.LIBROS)}</select></label>
          <div class="llave-fila">
            <label class="llave-campo"><span>Primer número</span><input name="rango1a" inputmode="numeric" maxlength="7" autocomplete="off" placeholder="Por ejemplo: 120" /></label>
            <label class="llave-campo"><span>Segundo número</span><input name="rango1b" inputmode="numeric" maxlength="7" autocomplete="off" placeholder="Por ejemplo: 135" /></label>
          </div>
        </div>
        <div class="llave-secreto" data-slot="2" hidden>
          <p class="llave-subtitulo">Tu segundo secreto</p>
          <label class="llave-campo"><span>Libro</span><select name="libro2">${opcion(llave.LIBROS)}</select></label>
          <div class="llave-fila">
            <label class="llave-campo"><span>Primer número</span><input name="rango2a" inputmode="numeric" maxlength="7" autocomplete="off" placeholder="Por ejemplo: 300" /></label>
            <label class="llave-campo"><span>Segundo número</span><input name="rango2b" inputmode="numeric" maxlength="7" autocomplete="off" placeholder="Por ejemplo: 301" /></label>
          </div>
        </div>
        <p class="llave-subtitulo">Tu identificador y tu avatar</p>
        <div class="llave-fila">
          <label class="llave-campo"><span>Identificador</span><select name="tipo"><option value="cedula">Cédula</option><option value="matricula">Matrícula</option></select></label>
          <label class="llave-campo"><span>Número</span><input name="valor" inputmode="numeric" maxlength="10" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Solo números" /></label>
        </div>
        <label class="llave-campo"><span>Avatar</span><select name="avatar">${opcion(llave.AVATARES)}</select></label>
      </div>

      <div class="llave-maxima" hidden>
        <p class="llave-subtitulo">Tus 12 palabras, en orden</p>
        <p class="llave-ayuda">Escribe las primeras letras y toca la palabra que aparece. También puedes pegar las 12 de una vez.</p>
        <div class="llave-palabras">${casillas}
        </div>
        <div class="llave-sugerencias" aria-live="polite"></div>
      </div>

      <button class="btn" type="submit">Reconstruir mi llave</button>
      <p class="llave-estado" role="status" aria-live="polite"></p>
    </form>
    <div class="llave-resultados" hidden></div>
  `;

  const form = $(".llave-form");
  const estado = $(".llave-estado");
  const resultados = $(".llave-resultados");

  function limpiarResultados() {
    resultados.hidden = true;
    resultados.innerHTML = "";
  }

  function mostrarNivel() {
    const nivel = form.nivel.value;
    $(".llave-cultural").hidden = nivel === "maximum";
    $(".llave-maxima").hidden = nivel !== "maximum";
    $('.llave-secreto[data-slot="2"]').hidden = nivel !== "advanced";
    estado.textContent = "";
    limpiarResultados();
  }

  form.addEventListener("change", (evento) => {
    if (evento.target.name === "nivel") mostrarNivel();
  });

  // ─── Las 12 palabras: autocompletar con la lista oficial, sin importar tildes ───
  const simple = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const lista = llave.PALABRAS.map((palabra) => ({ palabra, clave: simple(palabra) }));
  const exacta = new Map(lista.map((p) => [p.clave, p.palabra]));
  const entradas = [...raiz.querySelectorAll(".llave-palabra input")];
  const sugerencias = $(".llave-sugerencias");
  let activa = null;

  const coincidencias = (texto) => {
    const clave = simple(texto);
    return clave ? lista.filter((p) => p.clave.startsWith(clave)).slice(0, 4).map((p) => p.palabra) : [];
  };

  function marcar(entrada) {
    const clave = simple(entrada.value);
    const casilla = entrada.parentElement;
    casilla.classList.toggle("is-lista", exacta.has(clave));
    casilla.classList.toggle("is-error", clave !== "" && !exacta.has(clave) && coincidencias(clave).length === 0);
  }

  function sugerir(entrada) {
    activa = entrada;
    const opciones = coincidencias(entrada.value);
    const clave = simple(entrada.value);
    if (!clave || (opciones.length === 1 && simple(opciones[0]) === clave)) {
      sugerencias.innerHTML = "";
      return;
    }
    sugerencias.innerHTML = opciones.length
      ? opciones.map((p) => `<button type="button" class="llave-sugerencia" data-palabra="${p}">${p}</button>`).join("")
      : `<p class="llave-ayuda">Esa palabra no está en la lista. Revisa cómo la anotaste.</p>`;
  }

  function aceptar(entrada, palabra) {
    entrada.value = palabra;
    marcar(entrada);
    sugerencias.innerHTML = "";
    const siguiente = entradas[Number(entrada.dataset.i) + 1];
    if (siguiente) siguiente.focus();
    else entrada.blur();
  }

  function repartir(desde, texto) {
    const partes = texto.trim().split(/\s+/).filter(Boolean);
    partes.slice(0, 12 - desde).forEach((parte, j) => {
      const entrada = entradas[desde + j];
      entrada.value = exacta.get(simple(parte)) ?? parte.toLowerCase();
      marcar(entrada);
    });
    sugerencias.innerHTML = "";
    const siguiente = entradas[Math.min(desde + partes.length, 11)];
    siguiente.focus();
  }

  for (const entrada of entradas) {
    entrada.addEventListener("focus", () => sugerir(entrada));
    entrada.addEventListener("paste", (evento) => {
      const texto = evento.clipboardData?.getData("text") ?? "";
      if (/\s/.test(texto.trim())) {
        evento.preventDefault();
        repartir(Number(entrada.dataset.i), texto);
      }
    });
    entrada.addEventListener("input", () => {
      limpiarResultados();
      const valor = entrada.value;
      // Un espacio cierra la palabra: se acepta la primera coincidencia y se pasa a la siguiente.
      if (/\s/.test(valor)) {
        const partes = valor.trim().split(/\s+/).filter(Boolean);
        if (partes.length > 1) return repartir(Number(entrada.dataset.i), valor);
        const [primera] = coincidencias(partes[0] ?? "");
        entrada.value = partes[0] ?? "";
        if (primera) return aceptar(entrada, exacta.get(simple(entrada.value)) ?? primera);
      }
      marcar(entrada);
      // Palabra completa y sin otras que empiecen igual: pasa sola a la siguiente.
      const clave = simple(entrada.value);
      const opciones = coincidencias(clave);
      if (exacta.has(clave) && opciones.length === 1) return aceptar(entrada, exacta.get(clave));
      sugerir(entrada);
    });
    entrada.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter") {
        evento.preventDefault();
        const clave = simple(entrada.value);
        const [primera] = coincidencias(clave);
        if (primera) aceptar(entrada, exacta.get(clave) ?? primera);
      } else if (evento.key === "Backspace" && entrada.value === "" && entrada.dataset.i !== "0") {
        evento.preventDefault();
        entradas[Number(entrada.dataset.i) - 1].focus();
      }
    });
    entrada.addEventListener("blur", () => {
      // Si lo escrito solo puede ser una palabra, se completa al salir.
      const opciones = coincidencias(entrada.value);
      if (opciones.length === 1 && simple(entrada.value).length >= 3) entrada.value = opciones[0];
      marcar(entrada);
    });
  }

  // pointerdown, para que la sugerencia se acepte antes de que la casilla pierda el foco.
  sugerencias.addEventListener("pointerdown", (evento) => {
    const boton = evento.target.closest(".llave-sugerencia");
    if (!boton || !activa) return;
    evento.preventDefault();
    aceptar(activa, boton.dataset.palabra);
  });

  // ─── Resultado ───
  // Sin conexión no se puede saber cuál tiene movimiento: las otras dos que salen de los mismos datos.
  function tarjetaAlternativas(opciones) {
    const caja = document.createElement("article");
    caja.className = "llave-resultado";
    caja.innerHTML = `
      <p class="kicker">Si no es esta</p>
      <p class="llave-ayuda">Si la dirección de arriba no es la que ves en SERO, tu billetera es de antes y está en una de estas, que salen de los mismos datos.</p>
      <ol class="llave-bolsillos-lista">${opciones.map((o, i) => `<li><span class="llave-bolsillo-n">Otra ${i + 1}</span><code>${o.direccion}</code><code class="llave-bolsillo-llave" hidden>${o.llavePrivada}</code></li>`).join("")}</ol>
      <button class="btn ghost" type="button">Mostrar sus llaves</button>`;
    const boton = caja.querySelector("button");
    boton.addEventListener("click", () => {
      if (!confirm("Vas a ver llaves privadas. Asegúrate de que nadie esté mirando tu pantalla.")) return;
      for (const c of caja.querySelectorAll(".llave-bolsillo-llave")) c.hidden = false;
      boton.hidden = true;
    });
    return caja;
  }

  function filtrarCampos() {
    const campo = form.valor;
    const esCedula = form.tipo.value === "cedula";
    const limpio = esCedula
      ? campo.value.replace(/\D/g, "").slice(0, 10)
      : campo.value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9-]/g, "").replace(/-{2,}/g, "-").slice(0, 12);
    if (campo.value !== limpio) campo.value = limpio;
    campo.inputMode = esCedula ? "numeric" : "text";
    campo.maxLength = esCedula ? 10 : 12;
    campo.placeholder = esCedula ? "Solo números" : "Letras y números";
  }
  form.valor.addEventListener("input", filtrarCampos);
  form.tipo.addEventListener("change", filtrarCampos);
  for (const nombre of ["rango1a", "rango1b", "rango2a", "rango2b"]) {
    form[nombre].addEventListener("input", (e) => {
      const limpio = e.target.value.replace(/\D/g, "").slice(0, 7);
      if (e.target.value !== limpio) e.target.value = limpio;
    });
  }
  filtrarCampos();

  function tarjeta(r) {
    const caja = document.createElement("article");
    caja.className = "llave-resultado";
    caja.innerHTML = `
      <p class="kicker">Tu billetera</p>
      <p class="llave-direccion"><span>Tu dirección, la que compartes para recibir</span><code>${r.direccion}</code></p>
      <button class="btn ghost" type="button">Mostrar mi llave privada</button>
      <div class="llave-privada" hidden>
        <p class="llave-aviso">Quien tenga esta llave tiene tu dinero. No la envíes por chat, no la fotografíes y no la escribas en ninguna página que no conozcas.</p>
        <code>${r.llavePrivada}</code>
        <button class="btn ghost" type="button">Copiar la llave</button>
      </div>`;
    const [mostrar, copiar] = caja.querySelectorAll("button");
    mostrar.addEventListener("click", () => {
      if (!confirm("Vas a ver tu llave privada. Asegúrate de que nadie esté mirando tu pantalla.")) return;
      caja.querySelector(".llave-privada").hidden = false;
      mostrar.hidden = true;
    });
    copiar.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(r.llavePrivada);
        copiar.textContent = "Copiada";
      } catch {
        copiar.textContent = "Cópiala a mano";
      }
    });
    return caja;
  }

  // ─── Bolsillos ───
  const corta = (d) => `${d.slice(0, 8)}…${d.slice(-6)}`;
  // Primero el RPC de SERO (tiene toda la historia); si SERO ya no existe, el nodo público, que solo
  // entrega unos 9 días de historia: para cobros más antiguos hace falta un nodo de archivo.
  const GATE = "https://gate-latam.sero.foundation/api/rpc";
  const PUBLICO = "https://bsc-rpc.publicnode.com";
  const RPCS = [GATE, PUBLICO];
  const BLOQUES_POR_CONSULTA = 50000;
  // Los nodos públicos gratuitos de BNB Smart Chain guardan solo los registros de los últimos días: más
  // atrás devuelven una lista vacía sin avisar. Por eso los pagos solo se leen de un nodo con historial
  // completo (el de SERO o uno tuyo), y del público solo lo de las últimas horas. Lo que no se pudo leer
  // se dice, nunca se da por vacío.
  const RECIENTES = 120000; // ~15 horas de bloques
  // Un tramo con pagos SERO conocidos (5): un nodo que lo devuelve vacío no tiene el historial.
  const TRAMO_DE_PRUEBA = [132500000, 132549999];
  let nodoPropio = "";

  async function logsDe(url, filtro) {
    for (let intento = 0; intento < 3; intento += 1) {
      try {
        const respuesta = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [filtro] }) });
        const datos = await respuesta.json();
        if (respuesta.ok && Array.isArray(datos.result)) return datos.result;
      } catch {
        // se reintenta
      }
      await new Promise((r) => setTimeout(r, 1200 * (intento + 1)));
    }
    return null;
  }

  async function rpcPublico(metodo, parametros) {
    let ultimo;
    for (let intento = 0; intento < 4; intento += 1) {
      try {
        const respuesta = await fetch(RPCS[intento % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: metodo, params: parametros }) });
        const datos = await respuesta.json();
        if (respuesta.ok && !datos.error) return datos.result;
        ultimo = new Error(datos?.error?.message || `HTTP ${respuesta.status}`);
      } catch (error) {
        ultimo = error;
      }
      await new Promise((r) => setTimeout(r, 900 * (intento + 1)));
    }
    throw ultimo;
  }

  // Lee los pagos del contrato SERO por tramos de 50 000 bloques (3 a la vez) y se queda con los
  // que esta llave reconoce como suyos. Solo baja datos públicos; no envía nada tuyo.
  async function buscarCobros(llavePrivada, alAvanzar) {
    const reconocer = llave.reconocedorDeCobros(llavePrivada);
    const cabeza = Number.parseInt(await rpcPublico("eth_blockNumber", []), 16);
    const tramos = [];
    for (let a = llave.BOLSILLOS_DESDE_BLOQUE; a <= cabeza; a += BLOQUES_POR_CONSULTA) tramos.push([a, Math.min(cabeza, a + BLOQUES_POR_CONSULTA - 1)]);
    const hallados = new Map();
    const sinLeer = [];
    let hechos = 0;
    const cola = [...tramos];
    const trabajar = async () => {
      while (cola.length) {
        const [a, b] = cola.shift();
        const filtro = { address: llave.CONTRATO_SERO, topics: [llave.TEMA_PAGO_SERO], fromBlock: `0x${a.toString(16)}`, toBlock: `0x${b.toString(16)}` };
        const fuentes = [GATE, ...(nodoPropio ? [nodoPropio] : []), ...(cabeza - b < RECIENTES ? [PUBLICO] : [])];
        let logs = null;
        for (const fuente of fuentes) {
          logs = await logsDe(fuente, filtro);
          if (logs) break;
        }
        if (!logs) sinLeer.push([a, b]);
        for (const log of logs || []) {
          const t = log.topics || [];
          if (t.length < 4) continue;
          const bolsillo = reconocer(t[1], `0x${String(t[3]).slice(-40)}`);
          if (bolsillo) hallados.set(bolsillo.direccion, bolsillo);
        }
        hechos += 1;
        alAvanzar(hechos / tramos.length, hallados.size);
      }
    };
    await Promise.all(Array.from({ length: 3 }, trabajar));
    return { cobros: [...hallados.values()], sinLeer: sinLeer.sort((x, y) => x[0] - y[0]) };
  }

  // Lo mismo que mira la billetera para saber si una dirección ya se usó: dinero, gas, envíos o la
  // autorización al contrato de pagos.
  async function tieneActividad(direccion) {
    const d = direccion.slice(2).toLowerCase().padStart(64, "0");
    const [usdt, bnb, envios, permiso] = await Promise.all([
      saldoUsdt(direccion),
      rpcPublico("eth_getBalance", [direccion, "latest"]),
      rpcPublico("eth_getTransactionCount", [direccion, "latest"]),
      rpcPublico("eth_call", [{ to: USDT, data: `0xdd62ed3e${d}${llave.CONTRATO_SERO.slice(2).toLowerCase().padStart(64, "0")}` }, "latest"]),
    ]);
    return usdt > 0n || BigInt(bnb || "0x0") > 0n || Number.parseInt(envios || "0x0", 16) > 0 || BigInt(permiso || "0x0") > 0n;
  }

  const USDT = "0x55d398326f99059fF775485246999027B3197955";
  const enUsdt = (raw) => {
    const centavos = (raw + 5n * 10n ** 15n) / 10n ** 16n;
    return `${centavos / 100n}.${String(centavos % 100n).padStart(2, "0")}`;
  };
  const tope = async (tareas, simultaneas) => {
    const salida = new Array(tareas.length);
    let siguiente = 0;
    await Promise.all(Array.from({ length: simultaneas }, async () => {
      while (siguiente < tareas.length) {
        const i = siguiente++;
        salida[i] = await tareas[i]();
      }
    }));
    return salida;
  };
  const saldoUsdt = async (direccion) => BigInt(await rpcPublico("eth_call", [{ to: USDT, data: `0x70a08231${direccion.slice(2).toLowerCase().padStart(64, "0")}` }, "latest"]) || "0x0");

  // Bolsillos de recarga con movimiento: de 10 en 10 hasta 20 seguidos sin USDT, sin BNB y sin envíos.
  async function bolsillosDeRecargaUsados(llavePrivada) {
    const usados = [];
    let vacios = 0;
    for (let desde = 0; vacios < 20 && desde < 1000; desde += 10) {
      const lote = llave.bolsillosDeRecarga(llavePrivada, desde, 10);
      const estados = await tope(lote.map((b) => async () => {
        const [usdt, bnb, envios] = await Promise.all([saldoUsdt(b.direccion), rpcPublico("eth_getBalance", [b.direccion, "latest"]), rpcPublico("eth_getTransactionCount", [b.direccion, "latest"])]);
        return { usdt, usado: usdt > 0n || BigInt(bnb || "0x0") > 0n || Number.parseInt(envios || "0x0", 16) > 0 };
      }), 4);
      lote.forEach((b, i) => {
        if (vacios >= 20) return;
        if (estados[i].usado) { usados.push({ ...b, usdt: estados[i].usdt }); vacios = 0; } else vacios += 1;
      });
    }
    return usados;
  }

  function fila(etiqueta, b, detalle = "") {
    const li = document.createElement("li");
    li.innerHTML = `<span class="llave-bolsillo-n">${etiqueta}</span><a href="https://bscscan.com/address/${b.direccion}" rel="noopener" target="_blank"><code>${corta(b.direccion)}</code></a>${detalle ? `<span class="llave-bolsillo-saldo">${detalle}</span>` : ""}<code class="llave-bolsillo-llave" hidden>${b.llavePrivada}</code>`;
    return li;
  }

  // ─── Juntar todo en una dirección (salida de emergencia, sin SERO) ─────────────────────────
  // La dirección principal recibe un poco de BNB, reparte el gas justo a cada cuenta con dinero y cada
  // cuenta manda su USDT al destino. Todo se firma aquí. El avance (hashes, nunca llaves) queda en este
  // navegador para retomar sin repetir nada.
  const GAS_BNB = 21000n;
  const GAS_USDT = 65000n;
  const MINIMO_USDT = 10n ** 16n; // 0,01 USDT: menos no paga ni el gas
  const enBnb = (wei) => {
    const micro = (wei + 999999999999n) / 10n ** 12n; // hacia arriba, en millonésimas
    return `${micro / 1000000n}.${String(micro % 1000000n).padStart(6, "0")}`;
  };
  const deHexA = (h) => Uint8Array.from(h.slice(2).match(/../g) || [], (x) => parseInt(x, 16));
  const hashDe = (crudo) => `0x${llave.bytesToHex(llave.keccak256(deHexA(crudo)))}`;
  const saldoBnb = async (d) => BigInt(await rpcPublico("eth_getBalance", [d, "latest"]) || "0x0");
  const precioGas = async () => (BigInt(await rpcPublico("eth_gasPrice", [])) * 11n) / 10n;
  const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

  async function esperarRecibo(hash, segundos = 120) {
    for (let t = 0; t < segundos; t += 3) {
      try {
        const recibo = await rpcPublico("eth_getTransactionReceipt", [hash]);
        if (recibo) return recibo.status === "0x1";
      } catch {
        // la red no respondió: se vuelve a preguntar
      }
      await esperar(3000);
    }
    return false;
  }

  async function enviar(llavePrivada, tx) {
    const crudo = llave.firmarEnvio(llavePrivada, tx);
    const hash = hashDe(crudo);
    try {
      await rpcPublico("eth_sendRawTransaction", [crudo]);
    } catch {
      // Puede que ya estuviera en la red (otro nodo la recibió): se confirma por su hash.
    }
    return { hash, ok: await esperarRecibo(hash) };
  }

  // Un campo que solo acepta pegar: escribir a mano una dirección es donde nacen los errores.
  function soloPegar(campo, alCambiar) {
    campo.addEventListener("beforeinput", (e) => {
      if (e.inputType === "insertFromPaste") return;
      e.preventDefault();
      if (e.inputType && e.inputType.startsWith("delete")) { campo.value = ""; alCambiar(); }
    });
    campo.addEventListener("paste", (e) => {
      e.preventDefault();
      campo.value = (e.clipboardData?.getData("text") || "").trim();
      alCambiar();
    });
    campo.addEventListener("drop", (e) => e.preventDefault());
  }

  function tarjetaJuntar(principal, cuentas) {
    const clave = `sero-juntar:${principal.direccion.toLowerCase()}`;
    const leerAvance = () => { try { return JSON.parse(localStorage.getItem(clave) || "{}"); } catch { return {}; } };
    const guardarAvance = (a) => { try { localStorage.setItem(clave, JSON.stringify(a)); } catch { /* sin almacenamiento: igual funciona */ } };
    const caja = document.createElement("article");
    caja.className = "llave-resultado llave-juntar";
    caja.innerHTML = `
      <p class="kicker">Juntar todo en una dirección</p>
      <p>Si SERO ya no está, esto pasa el dinero de todas tus cuentas a una sola dirección. Todo se firma aquí, en tu dispositivo.</p>
      <div class="llave-juntar-paso" data-paso1>
      <fieldset class="llave-niveles llave-juntar-destino">
        <legend>¿A dónde lo juntas?</legend>
        <label><input type="radio" name="juntar-destino" value="principal" checked /> A mi dirección principal</label>
        <label><input type="radio" name="juntar-destino" value="otra" /> A otra dirección</label>
      </fieldset>
      <div class="llave-juntar-otra" data-otra hidden>
        <label class="llave-campo"><span>Dirección de destino en BNB Smart Chain (solo se puede pegar)</span><input data-destino autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="Pega la dirección aquí" /></label>
        <button class="btn ghost" type="button" data-accion="pegar">Pegar</button>
        <p class="llave-ayuda" data-destino-estado></p>
      </div>
      <button class="btn" type="button" data-accion="continuar">Continuar</button>
      </div>
      <div class="llave-juntar-elegido" data-elegido hidden>
        <p class="llave-juntar-cabeza"><span data-elegido-texto></span><button class="llave-enlace" type="button" data-accion="cambiar">Cambiar</button></p>
        <code data-elegido-dir></code>
      </div>
      <p class="llave-estado" data-preparando hidden>Revisando tus cuentas…</p>
      <div class="llave-juntar-paso" data-gas hidden>
        <p data-gas-texto></p>
        <div class="llave-juntar-qr" data-qr></div>
        <p class="llave-direccion"><code>${principal.direccion}</code></p>
        <button class="btn ghost" type="button" data-accion="copiar">Copiar la dirección</button>
        <p class="llave-estado" data-gas-estado></p>
      </div>
      <div class="llave-juntar-paso" data-resumen hidden>
        <p data-resumen-texto></p>
        <button class="btn" type="button" data-accion="juntar">Juntar todo</button>
      </div>
      <ol class="llave-juntar-pasos" data-pasos hidden></ol>
      <p class="llave-estado" data-final></p>`;
    const $c = (sel) => caja.querySelector(sel);
    const campo = $c("[data-destino]");
    const estadoDestino = $c("[data-destino-estado]");
    let destino = principal.direccion;
    let vigilando = 0;

    const leerDestino = () => {
      const otra = caja.querySelector('input[name="juntar-destino"]:checked').value === "otra";
      $c("[data-otra]").hidden = !otra;
      if (!otra) { destino = principal.direccion; estadoDestino.textContent = ""; return true; }
      const t = campo.value.trim();
      if (!t) { destino = ""; estadoDestino.textContent = ""; return false; }
      if (!llave.direccionValida(t)) { destino = ""; estadoDestino.textContent = "Esa dirección no es válida. Cópiala de nuevo, completa."; return false; }
      destino = t;
      estadoDestino.textContent = "Dirección válida.";
      return true;
    };
    soloPegar(campo, leerDestino);
    for (const radio of caja.querySelectorAll('input[name="juntar-destino"]')) radio.addEventListener("change", leerDestino);
    $c('[data-accion="pegar"]').addEventListener("click", async () => {
      try { campo.value = (await navigator.clipboard.readText()).trim(); } catch { estadoDestino.textContent = "Mantén presionado el campo y elige «Pegar»."; return; }
      leerDestino();
    });
    $c('[data-accion="copiar"]').addEventListener("click", async (e) => {
      try { await navigator.clipboard.writeText(principal.direccion); e.target.textContent = "Copiada"; } catch { e.target.textContent = "Cópiala a mano"; }
    });

    // El plan con los saldos de este momento: qué cuentas envían y cuánto BNB hace falta.
    async function planear() {
      const gp = await precioGas();
      const estados = await tope(cuentas.map((c) => async () => ({ ...c, usdt: await saldoUsdt(c.direccion), bnb: await saldoBnb(c.direccion) })), 4);
      const d = destino.toLowerCase();
      const origenes = estados.filter((c) => c.direccion.toLowerCase() !== d && c.usdt >= MINIMO_USDT);
      const esPrincipal = (c) => c.direccion.toLowerCase() === principal.direccion.toLowerCase();
      let necesita = 0n;
      for (const c of origenes) {
        if (esPrincipal(c)) { necesita += GAS_USDT * gp; continue; }
        const falta = GAS_USDT * gp - c.bnb;
        if (falta > 0n) { c.falta = falta; necesita += falta + GAS_BNB * gp; }
      }
      necesita = (necesita * 115n) / 100n;
      const bnbPrincipal = estados.find(esPrincipal)?.bnb ?? (await saldoBnb(principal.direccion));
      const total = origenes.reduce((t, c) => t + c.usdt, 0n);
      return { gp, origenes, total, deposito: necesita > bnbPrincipal ? necesita - bnbPrincipal : 0n };
    }

    async function mostrarResumen(plan) {
      $c("[data-preparando]").hidden = true;
      $c("[data-gas]").hidden = true;
      $c("[data-resumen]").hidden = false;
      $c("[data-resumen-texto]").innerHTML = plan.origenes.length
        ? `Vas a juntar <b>${enUsdt(plan.total)} USDT</b> de ${plan.origenes.length} ${plan.origenes.length === 1 ? "cuenta" : "cuentas"}.`
        : "No hay nada que juntar: tu dinero ya está en esa dirección.";
      $c('[data-accion="juntar"]').hidden = !plan.origenes.length;
    }

    // Paso 1 a la vista, o la elección ya hecha resumida en una línea con «Cambiar».
    const verPaso1 = (si) => {
      $c("[data-paso1]").hidden = !si;
      $c("[data-elegido]").hidden = si;
      if (si) { $c("[data-preparando]").hidden = true; $c("[data-gas]").hidden = true; $c("[data-resumen]").hidden = true; }
    };
    $c('[data-accion="cambiar"]').addEventListener("click", () => { vigilando += 1; verPaso1(true); });

    $c('[data-accion="continuar"]').addEventListener("click", async () => {
      if (!leerDestino()) { campo.focus(); return; }
      $c("[data-elegido-texto]").textContent = destino === principal.direccion ? "Lo juntas en tu dirección principal" : "Lo juntas en esta dirección";
      $c("[data-elegido-dir]").textContent = destino;
      verPaso1(false);
      $c("[data-preparando]").hidden = false;
      const estadoGas = $c("[data-gas-estado]");
      const vuelta = ++vigilando;
      try {
        let plan = await planear();
        if (vuelta !== vigilando) return;
        if (plan.deposito === 0n) return mostrarResumen(plan);
        $c("[data-preparando]").hidden = true;
        $c("[data-gas]").hidden = false;
        $c("[data-gas-texto]").innerHTML = `Mover tus cuentas tiene un pequeño costo en BNB, la moneda de la red. Envía <b>${enBnb(plan.deposito)} BNB</b> por la red BNB Smart Chain a tu dirección principal. Lo que sobre se queda en tus cuentas.`;
        try { $c("[data-qr]").innerHTML = await llave.qrSvg(principal.direccion); } catch { /* sin QR, queda la dirección */ }
        estadoGas.textContent = "Esperando tu BNB…";
        while (vuelta === vigilando) {
          await esperar(6000);
          try {
            plan = await planear();
            if (plan.deposito === 0n) { estadoGas.textContent = "Llegó tu BNB."; return mostrarResumen(plan); }
          } catch {
            // la red no respondió: se vuelve a mirar
          }
        }
      } catch {
        if (vuelta !== vigilando) return;
        verPaso1(true);
        $c("[data-destino-estado]").textContent = "";
        $c("[data-final]").textContent = "La red pública no respondió. Inténtalo de nuevo en unos minutos.";
      }
    });

    $c('[data-accion="juntar"]').addEventListener("click", async (e) => {
      e.target.disabled = true;
      $c('[data-accion="cambiar"]').hidden = true;
      const pasos = $c("[data-pasos]");
      const final = $c("[data-final]");
      pasos.hidden = false;
      pasos.innerHTML = "";
      const avance = leerAvance();
      // Una fila por cuenta y paso: qué cuenta, qué pasó y, si hay movimiento, su enlace en BscScan.
      const filas = new Map();
      const linea = (c, texto) => {
        if (filas.has(c.direccion)) { filas.get(c.direccion)(texto); return filas.get(c.direccion); }
        const li = document.createElement("li");
        li.innerHTML = `<span class="llave-paso-cuenta">${c.etiqueta} <code>${corta(c.direccion)}</code></span><span class="llave-paso-estado"></span>`;
        pasos.append(li);
        const poner = (t, hash) => { li.querySelector(".llave-paso-estado").innerHTML = `${t}${hash ? ` <a href="https://bscscan.com/tx/${hash}" rel="noopener" target="_blank">ver</a>` : ""}`; };
        poner(texto);
        filas.set(c.direccion, poner);
        return poner;
      };
      let pendientes = 0;
      let juntado = 0n;
      try {
        // Si quedó algo en camino de una vez anterior, primero se espera.
        for (const h of Object.values(avance).flatMap((x) => [x.bnb, x.usdt]).filter(Boolean)) await esperarRecibo(h, 30);
        const plan = await planear();
        const principalLlave = principal.llavePrivada;
        // 1 · El BNB justo a cada cuenta que lo necesita, desde la dirección principal.
        let nonce = BigInt(await rpcPublico("eth_getTransactionCount", [principal.direccion, "pending"]));
        for (const c of plan.origenes.filter((x) => x.falta)) {
          const poner = linea(c, "preparándola…");
          const r1 = await enviar(principalLlave, { nonce, gasPrice: plan.gp, gasLimit: GAS_BNB, to: c.direccion, value: c.falta, data: "0x" });
          nonce += 1n;
          avance[c.direccion] = { ...(avance[c.direccion] || {}), bnb: r1.hash };
          guardarAvance(avance);
          poner(r1.ok ? "lista para mover ✓" : "sin confirmar todavía", r1.hash);
        }
        // 2 · Cada cuenta manda todo su USDT al destino (la principal, al final).
        const orden = [...plan.origenes].sort((a, b) => (a.direccion.toLowerCase() === principal.direccion.toLowerCase()) - (b.direccion.toLowerCase() === principal.direccion.toLowerCase()));
        for (const c of orden) {
          const poner = linea(c, `enviando ${enUsdt(c.usdt)} USDT…`);
          const usdt = await saldoUsdt(c.direccion);
          if (usdt < MINIMO_USDT) { poner("ya estaba vacía ✓"); continue; }
          const n = BigInt(await rpcPublico("eth_getTransactionCount", [c.direccion, "pending"]));
          const r2 = await enviar(c.llavePrivada, { nonce: n, gasPrice: plan.gp, gasLimit: GAS_USDT, to: llave.USDT_BSC, value: 0n, data: llave.datosDeTransferenciaUsdt(destino, usdt) });
          avance[c.direccion] = { ...(avance[c.direccion] || {}), usdt: r2.hash };
          guardarAvance(avance);
          if (r2.ok) { juntado += usdt; poner(`${enUsdt(usdt)} USDT ✓`, r2.hash); }
          else { pendientes += 1; poner("sin confirmar todavía", r2.hash); }
        }
        // Lo juntado se suma de los envíos confirmados: un nodo público puede tardar en mostrar el saldo nuevo.
        final.textContent = pendientes
          ? `Quedan ${pendientes} por confirmar. Toca «Juntar todo» de nuevo en unos minutos: no se repite nada de lo que ya se hizo.`
          : `Listo: juntaste ${enUsdt(juntado)} USDT en ${corta(destino)}.`;
        if (!pendientes) $c("[data-resumen]").hidden = true;
      } catch {
        final.textContent = "La red pública no respondió. Toca «Juntar todo» de nuevo: sigue desde donde quedó.";
      } finally {
        e.target.disabled = false;
        if (pendientes || !final.textContent.startsWith("Listo")) $c('[data-accion="cambiar"]').hidden = false;
      }
    });
    return caja;
  }

  function tarjetaBolsillos(r) {
    const caja = document.createElement("article");
    caja.className = "llave-resultado llave-bolsillos";
    const explicacion = `<p>Para cuidar tu privacidad, tu dinero está repartido en varias cuentas tuyas. Todas salen de esta misma llave, solo tú las controlas, y aquí las encuentras.</p>`;
    caja.innerHTML = red ? `
      <p class="kicker">Tu dinero</p>
      ${explicacion}
      <p class="llave-ayuda">La búsqueda lee la red pública desde tu dispositivo. Tu llave no sale de él.</p>
      <button class="btn ghost" type="button" data-accion="buscar">Buscar mi dinero</button>
      <p class="llave-estado" data-estado></p>
      <div class="llave-incompleto" data-incompleto hidden>
        <p class="llave-aviso" data-aviso-incompleto></p>
        <details class="llave-avanzada">
        <summary>Opción avanzada</summary>
        <label class="llave-campo"><span>Dirección de un nodo de BNB Smart Chain con todos los bloques</span><input data-nodo inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://…" /></label>
        <p class="llave-ayuda">Algunos proveedores de BNB Smart Chain dan uno gratis al registrarte. La herramienta solo le pide datos públicos de la red: tu llave nunca sale de tu dispositivo.</p>
        <button class="btn ghost" type="button" data-accion="con-nodo">Buscar con este nodo</button>
        </details>
      </div>
      <ol class="llave-bolsillos-lista" data-lista="hallados" hidden></ol>
      <p class="llave-bolsillos-total" data-total hidden></p>
      <button class="btn ghost" type="button" data-accion="llaves" hidden>Mostrar las llaves</button>` : `
      <p class="kicker">Tu dinero</p>
      ${explicacion}
      <p class="llave-ayuda"><b>Esta copia no se conecta a internet</b>, así que no puede saber cuáles tienen dinero. Toca cada una para ver su saldo. Los pagos que te hicieron otros usuarios de SERO solo se encuentran con internet, en web.sero.foundation/llave/.</p>
      <ol class="llave-bolsillos-lista" data-lista="recarga"></ol>
      <button class="btn ghost" type="button" data-accion="mas">Ver más</button>
      <button class="btn ghost" type="button" data-accion="llaves">Mostrar las llaves</button>`;
    let llavesVisibles = false;
    const conLlave = (li) => { li.querySelector(".llave-bolsillo-llave").hidden = !llavesVisibles; return li; };
    const botonLlaves = caja.querySelector('[data-accion="llaves"]');
    botonLlaves.addEventListener("click", () => {
      if (!llavesVisibles && !confirm("Vas a ver las llaves privadas de tus cuentas. Asegúrate de que nadie esté mirando tu pantalla.")) return;
      llavesVisibles = !llavesVisibles;
      for (const c of caja.querySelectorAll(".llave-bolsillo-llave")) c.hidden = !llavesVisibles;
      botonLlaves.textContent = llavesVisibles ? "Ocultar las llaves" : "Mostrar las llaves";
    });

    if (!red) {
      const lista = caja.querySelector('[data-lista="recarga"]');
      let siguiente = 0;
      const agregar = (cuantos) => {
        for (const b of llave.bolsillosDeRecarga(r.llavePrivada, siguiente, cuantos)) lista.append(conLlave(fila(`Cuenta ${b.numero + 1}`, b)));
        siguiente += cuantos;
      };
      agregar(5);
      caja.querySelector('[data-accion="mas"]').addEventListener("click", () => agregar(10));
      return caja;
    }

    const buscar = caja.querySelector('[data-accion="buscar"]');
    const estadoBolsillos = caja.querySelector("[data-estado]");
    const lista = caja.querySelector('[data-lista="hallados"]');
    const total = caja.querySelector("[data-total]");
    const incompleto = caja.querySelector("[data-incompleto]");
    const campoNodo = caja.querySelector("[data-nodo]");
    const botonNodo = caja.querySelector('[data-accion="con-nodo"]');
    botonNodo.addEventListener("click", async () => {
      const url = campoNodo.value.trim();
      const aviso = caja.querySelector("[data-aviso-incompleto]");
      if (!/^https:\/\/\S+$/.test(url)) { campoNodo.focus(); return; }
      botonNodo.disabled = true;
      botonNodo.textContent = "Probando el nodo…";
      const [a, b] = TRAMO_DE_PRUEBA;
      const prueba = await logsDe(url, { address: llave.CONTRATO_SERO, topics: [llave.TEMA_PAGO_SERO], fromBlock: `0x${a.toString(16)}`, toBlock: `0x${b.toString(16)}` });
      botonNodo.disabled = false;
      botonNodo.textContent = "Buscar con este nodo";
      if (!prueba || prueba.length === 0) {
        aviso.textContent = "Ese nodo no tiene todos los bloques de la red, o no respondió. Prueba con otro.";
        campoNodo.focus();
        return;
      }
      nodoPropio = url;
      buscar.click();
    });
    buscar.addEventListener("click", async () => {
      buscar.disabled = true;
      lista.hidden = true;
      total.hidden = true;
      botonLlaves.hidden = true;
      lista.innerHTML = "";
      incompleto.hidden = true;
      try {
        estadoBolsillos.textContent = "Buscando tus cuentas…";
        const recargas = await bolsillosDeRecargaUsados(r.llavePrivada);
        const { cobros, sinLeer } = await buscarCobros(r.llavePrivada, (avance, cuantos) => {
          estadoBolsillos.textContent = `Buscando pagos que te hicieron: ${Math.round(avance * 100)} %`;
        });
        estadoBolsillos.textContent = "Sumando…";
        const saldos = await tope(cobros.map((b) => () => saldoUsdt(b.direccion)), 4);
        const puerta = await saldoUsdt(r.direccion);
        lista.append(conLlave(fila("Tu dirección", { direccion: r.direccion, llavePrivada: r.llavePrivada }, `${enUsdt(puerta)} USDT`)));
        // Solo las cuentas con dinero: las ya vaciadas no aportan nada y confunden.
        const conDinero = [
          ...recargas.filter((b) => b.usdt > 0n).map((b) => [`Cuenta ${b.numero + 1}`, b, b.usdt]),
          ...cobros.map((b, i) => ["Pago recibido", b, saldos[i]]).filter(([, , saldo]) => saldo > 0n),
        ];
        for (const [etiqueta, b, saldo] of conDinero) lista.append(conLlave(fila(etiqueta, b, `${enUsdt(saldo)} USDT`)));
        const suma = puerta + recargas.reduce((t, b) => t + b.usdt, 0n) + saldos.reduce((t, x) => t + x, 0n);
        const cuantos = conDinero.length;
        lista.hidden = false;
        botonLlaves.hidden = false;
        total.innerHTML = `Total: <b>${enUsdt(suma)} USDT</b> <span>Es el mismo saldo que ves en SERO.</span>`;
        total.hidden = false;
        estadoBolsillos.textContent = cuantos ? `Tu dinero está en ${cuantos + 1} cuentas.` : "Todo tu dinero está en tu dirección.";
        // Juntar todo: con dinero fuera de la dirección principal (o para mandarlo todo a otra dirección).
        caja.parentElement?.querySelector(".llave-juntar")?.remove();
        if (suma > 0n) caja.after(tarjetaJuntar(r, [{ etiqueta: "Tu dirección", direccion: r.direccion, llavePrivada: r.llavePrivada }, ...conDinero.map(([etiqueta, b]) => ({ etiqueta, direccion: b.direccion, llavePrivada: b.llavePrivada }))]));
        if (sinLeer.length) {
          // Nunca se da por vacío lo que no se pudo leer: se dice.
          caja.querySelector("[data-aviso-incompleto]").textContent = "No pudimos revisar tus pagos más antiguos. Tu dinero no se perdió: sigue en la red, y este total puede ser menor que el real.";
          estadoBolsillos.textContent = "Búsqueda incompleta.";
          total.innerHTML = `Encontrado hasta ahora: <b>${enUsdt(suma)} USDT</b>`;
          incompleto.hidden = false;
        }
      } catch {
        estadoBolsillos.textContent = "La red pública no respondió. Inténtalo de nuevo en unos minutos.";
      } finally {
        buscar.disabled = false;
      }
    });
    return caja;
  }

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const nivel = form.nivel.value;
    const boton = form.querySelector('button[type="submit"]');
    limpiarResultados();
    if (nivel === "maximum") {
      const faltan = entradas.filter((e) => !exacta.has(simple(e.value)));
      if (faltan.length) {
        estado.textContent = faltan.length === 12 ? "Escribe tus 12 palabras." : `Revisa la palabra ${Number(faltan[0].dataset.i) + 1}: no está completa o no está en la lista.`;
        faltan[0].focus();
        return;
      }
    }
    boton.disabled = true;
    estado.textContent = nivel === "maximum" ? "Calculando…" : "Calculando. Puede tardar unos segundos: es a propósito, para que nadie pueda adivinar tu secreto a fuerza de intentos.";
    // Un respiro para que el aviso se pinte antes del cálculo pesado.
    await new Promise((resolver) => setTimeout(resolver, 60));
    try {
      let r;
      let alternativas = [];
      if (nivel === "maximum") {
        r = llave.llaveDePalabras(entradas.map((e) => exacta.get(simple(e.value))).join(" "));
      } else {
        const rango = (k) => `${form[`rango${k}a`].value}-${form[`rango${k}b`].value}`;
        const secretos = [{ libro: Number(form.libro1.value), rango: rango(1) }];
        if (nivel === "advanced") secretos.push({ libro: Number(form.libro2.value), rango: rango(2) });
        const opciones = await llave.llavesDeNivel(nivel, form.tipo.value, form.valor.value, Number(form.avatar.value), secretos);
        r = opciones[0];
        if (red) {
          // Como la billetera: la primera de las tres con movimiento en la red; si ninguna, la vigente.
          estado.textContent = "Comprobando cuál de tus direcciones tiene movimiento…";
          try {
            const actividad = await Promise.all(opciones.map((o) => tieneActividad(o.direccion)));
            r = opciones[Math.max(0, actividad.indexOf(true))];
          } catch {
            alternativas = opciones.slice(1);
          }
        } else {
          alternativas = opciones.slice(1);
        }
      }
      resultados.append(tarjeta(r), ...(alternativas.length ? [tarjetaAlternativas(alternativas)] : []), tarjetaBolsillos(r));
      resultados.hidden = false;
      estado.textContent = "Listo. Nada de esto salió de tu dispositivo.";
    } catch (error) {
      estado.textContent = error instanceof Error ? error.message : "No se pudo reconstruir la llave";
    } finally {
      boton.disabled = false;
    }
  });
}

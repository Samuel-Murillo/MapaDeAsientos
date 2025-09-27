document.addEventListener("DOMContentLoaded", () => {

  // Verificación de elementos
  const svgObject = document.getElementById("svgMapa");
  const input = document.getElementById("seatInput");
  const button = document.getElementById("searchButton");
  const info = document.getElementById("seatInfo");

  if (!svgObject) {
    alert("No se encontró el objeto SVG en la página");
    return;
  }
  if (!input || !button || !info) {
    alert("No se encontraron los elementos del formulario. Verifica los IDs en index.html");
    return;
  }

  svgObject.addEventListener("load", () => {
    const svgDoc = svgObject.contentDocument;
    if (!svgDoc) {
      console.error("No se pudo acceder al contenido del SVG");
      info.textContent = "❌ No se pudo cargar el mapa de asientos.";
      return;
    }

    const svgRoot = svgDoc.documentElement;
    let overlay = svgDoc.getElementById("overlay-marks");
    if (!overlay) {
      overlay = svgDoc.createElementNS("http://www.w3.org/2000/svg", "g");
      overlay.setAttribute("id", "overlay-marks");
      overlay.setAttribute("stroke", "red");
      overlay.setAttribute("stroke-width", "2");
      svgRoot.appendChild(overlay);
    }

    // Detectar todos los rects candidatos y tomar medidas para identificar el bloque principal de asientos
    const allRects = Array.from(svgDoc.querySelectorAll("rect.cls-3"));
    const rectInfos = allRects.map(r => {
      const x = parseFloat(r.getAttribute("x")) || 0;
      const y = parseFloat(r.getAttribute("y")) || 0;
      const w = parseFloat(r.getAttribute("width")) || 0;
      const h = parseFloat(r.getAttribute("height")) || 0;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const fill = r.getAttribute("fill");
      return { r, x, y, w, h, cx, cy, fill };
    });

    // Filtrar por tamaño: calcular mediana de anchuras/alturas y mantener rects similares
    function median(values) {
      const s = values.slice().sort((a,b)=>a-b);
      const m = Math.floor(s.length/2);
      return s.length%2===0 ? (s[m-1]+s[m])/2 : s[m];
    }
    const widths = rectInfos.map(i=>i.w).filter(v=>v>0);
    const heights = rectInfos.map(i=>i.h).filter(v=>v>0);
    const medW = widths.length ? median(widths) : 0;
    const medH = heights.length ? median(heights) : 0;

    const sizeTol = 0.6; // aceptar entre 60% y 140% del tamaño medio
    // Filtrar solo por tamaño similar (más inclusivo). Esto evita excluir asientos por fill.
    const candidates = rectInfos.filter(i => {
      if (!i.w || !i.h) return false;
      const szOk = i.w >= medW*sizeTol && i.w <= medW*(2-sizeTol) && i.h >= medH*sizeTol && i.h <= medH*(2-sizeTol);
      return szOk;
    });

    if (candidates.length === 0) {
      info.textContent = "❌ No se detectaron asientos válidos en el SVG.";
      return;
    }

    // Agrupar por cy (centro Y) usando tolerancia basada en mediana de altura
    const tol = Math.max(4, medH*0.5);
    const rows = [];
    candidates.forEach(ci => {
      let found = false;
      for (const row of rows) {
        if (Math.abs(row.cy - ci.cy) <= tol) {
          row.items.push(ci);
          row.cy = (row.cy * (row.items.length-1) + ci.cy) / row.items.length; // actualizar rep cy
          found = true;
          break;
        }
      }
      if (!found) rows.push({ cy: ci.cy, items: [ci] });
    });

    // Mantener solo filas con muchos asientos (descartar filas ruidosas)
    const maxCount = Math.max(...rows.map(r=>r.items.length));
    const validRows = rows.filter(r => r.items.length >= Math.max(4, Math.round(maxCount*0.4)));
    if (validRows.length === 0) {
      info.textContent = "❌ No se encontraron filas consistentes de asientos.";
      return;
    }

    // Ordenar filas por cy descendente (bottom -> top)
    validRows.sort((a,b) => b.cy - a.cy);

    // Numerar: iterar filas bottom->top y dentro de cada fila ordenar por cx asc
    let seatIndex = 0;
    validRows.forEach((rowObj, rowIdx) => {
      const sorted = rowObj.items.sort((a,b) => a.cx - b.cx);
      sorted.forEach((ci, colIdx) => {
        seatIndex += 1;
        ci.r.setAttribute("data-seat", seatIndex);
        ci.r.setAttribute("data-row", rowIdx+1);
        ci.r.setAttribute("data-col", colIdx+1);
        // guardar color original
        const orig = ci.r.getAttribute("data-orig-fill");
        if (!orig) ci.r.setAttribute("data-orig-fill", ci.r.getAttribute("fill") || "#ffffff");
      });
    });

    // Debug: construir resumen de filas detectadas
    /*const rowSummaries = validRows.map((r, i) => `fila${i+1}:cy=${Math.round(r.cy)} count=${r.items.length}`);
    const firstAssigned = svgDoc.querySelector("rect[data-seat='1']");
    let debugMsg = `Asignados ${seatIndex} asientos. Filas detectadas: ${rowSummaries.length}. `;
    debugMsg += rowSummaries.join(' | ');
    if (firstAssigned) {
      const fx = firstAssigned.getAttribute('x');
      const fy = firstAssigned.getAttribute('y');
      debugMsg += ` → Asiento1 x=${fx}, y=${fy}`;
    }
    info.textContent = debugMsg;*/


    let lastSeat = null;
    function marcarAsiento(numero) {
      while (overlay.firstChild) overlay.removeChild(overlay.firstChild);

      // Restaurar color del último asiento seleccionado
      if (lastSeat) {
        const orig = lastSeat.getAttribute('data-orig-fill') || lastSeat.getAttribute('fill') || '#fff';
        lastSeat.setAttribute('fill', orig);
      }

      const seat = svgDoc.querySelector(`rect[data-seat='${numero}']`);
      if (!seat) {
        info.textContent = `❌ Asiento ${numero} no encontrado`;
        return;
      }

      // Cambiar color del asiento seleccionado
      seat.setAttribute("fill", "#ff9800"); // naranja
  lastSeat = seat;
  try { svgObject._lastSeat = seat; } catch (_) {}

      const x = parseFloat(seat.getAttribute("x"));
      const y = parseFloat(seat.getAttribute("y"));
      const w = parseFloat(seat.getAttribute("width"));
      const h = parseFloat(seat.getAttribute("height"));

      const cx = x + w / 2;
      const cy = y + h / 2;
      const offset = Math.min(w, h) / 2;

      const line1 = svgDoc.createElementNS("http://www.w3.org/2000/svg", "line");
      line1.setAttribute("x1", cx - offset);
      line1.setAttribute("y1", cy - offset);
      line1.setAttribute("x2", cx + offset);
      line1.setAttribute("y2", cy + offset);

      const line2 = svgDoc.createElementNS("http://www.w3.org/2000/svg", "line");
      line2.setAttribute("x1", cx - offset);
      line2.setAttribute("y1", cy + offset);
      line2.setAttribute("x2", cx + offset);
      line2.setAttribute("y2", cy - offset);

      overlay.appendChild(line1);
      overlay.appendChild(line2);

      const row = seat.getAttribute("data-row");
      const col = seat.getAttribute("data-col");
      info.textContent = `✅ Asiento ${numero} → Fila ${row}, Columna ${col}`;
    }

    button.addEventListener("click", () => {
      if (!svgObject.contentDocument) {
        info.textContent = "❌ El mapa SVG no está disponible.";
        return;
      }
      const num = parseInt(input.value);
      if (isNaN(num)) {
        info.textContent = "⚠️ Ingresa un número válido";
        return;
      }
      marcarAsiento(num);
    });
  });

  // Si el SVG no carga en 3 segundos, mostrar advertencia
  setTimeout(() => {
    if (!svgObject.contentDocument) {
      info.textContent = "⚠️ El mapa de asientos no se ha cargado. Intenta recargar la página.";
    }
  }, 3000);
});

// Código base para comenzar las nuevas funcionalidades
// --- Nuevas funcionalidades: búsqueda por nombre usando el CSV ---
// Cargar y parsear el CSV de nombres (archivo local en el mismo directorio)
async function cargarCSV(ruta) {
  try {
    const resp = await fetch(ruta);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const txt = await resp.text();
    return parseCSV(txt);
  } catch (e) {
    console.error('Error cargando CSV:', e);
    return null;
  }
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const encabezado = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Manejo simple de comillas: dividir respetando comillas no trivial pero suficiente para este CSV
    const parts = line.match(/(?:"([^"]*)")|([^,]+)/g).map(s => s.replace(/^"|"$/g, '').trim());
    // Acomodar hasta 3 columnas: Asiento, Nombre, Apellido
    const asiento = parts[0] ? parts[0].trim() : '';
    const nombre = parts[1] ? parts[1].trim() : '';
    const apellido = parts[2] ? parts[2].trim() : '';
    if (asiento) rows.push({ asiento: asiento, nombre: nombre, apellido: apellido });
  }
  return rows;
}

// Normalizar para búsqueda: quitar tildes y pasar a minúsculas
function normalizeString(s) {
  if (!s) return '';
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

// Buscar coincidencias por nombre y/o apellido
function buscarEnCSV(list, query) {
  const q = normalizeString(query.trim());
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(t => t.length>0);

  return list.filter(item => {
    const full = normalizeString((item.nombre || '') + ' ' + (item.apellido || ''));
    const nombre = normalizeString(item.nombre || '');
    const apellido = normalizeString(item.apellido || '');
    // Si el usuario pone dos tokens, intentar que ambos estén (nombre y apellido)
    if (tokens.length >= 2) {
      return tokens.every(t => full.includes(t));
    }
    // Si un token, aceptar si aparece en nombre o apellido o full
    const t = tokens[0];
    return nombre.includes(t) || apellido.includes(t) || full.includes(t);
  });
}

// Integrar con el UI: cuando el usuario escribe texto en input y presiona buscar, buscar en CSV
// Nota: el código de numeración de asientos en el SVG ya asigna `data-seat` a rects.
// Cargamos el CSV al inicio (archivo local) y lo guardamos en memoria.
let csvData = null;
// Intentamos cargar el CSV relativo al root (misma carpeta)
cargarCSV('nombresConAsientos.csv').then(data => {
  if (!data) {
    console.warn('No se pudo cargar nombresConAsientos.csv');
    return;
  }
  csvData = data;
  console.info(`CSV cargado: ${csvData.length} registros`);
});

// Reutilizar el input/button/info del DOM (si existen)
const mainInput = document.getElementById('seatInput');
const mainButton = document.getElementById('searchButton');
const mainInfo = document.getElementById('seatInfo');

// Conectar formulario de búsqueda por nombre (inputs recién agregados en index.html)
const firstNameInput = document.getElementById('firstNameInput');
const lastNameInput = document.getElementById('lastNameInput');
const searchByNameButton = document.getElementById('searchByNameButton');

if (searchByNameButton && (firstNameInput || lastNameInput)) {
  searchByNameButton.addEventListener('click', () => {
    const n = (firstNameInput && firstNameInput.value) ? firstNameInput.value.trim() : '';
    const a = (lastNameInput && lastNameInput.value) ? lastNameInput.value.trim() : '';
    const query = (n && a) ? `${n} ${a}` : (n || a);
    if (!query) {
      if (mainInfo) mainInfo.textContent = '⚠️ Ingresa nombre o apellido para buscar.';
      return;
    }
    // Colocar el texto en el input principal para reusar la lógica del botón principal
    if (mainInput) mainInput.value = query;
    // Simular click del botón principal
    if (mainButton) mainButton.click();
  });
}

if (mainButton && mainInput) {
  // Adjuntar manejador adicional que decide si buscar por número o por nombre
  mainButton.addEventListener('click', async (ev) => {
    const val = mainInput.value.trim();
    if (!val) {
      mainInfo.textContent = '⚠️ Ingresa un número o un nombre para buscar';
      return;
    }

    // Priorizar búsqueda numérica si la entrada es un entero
    const maybeNum = parseInt(val);
    if (!isNaN(maybeNum) && String(maybeNum) === val) {
      // Llamar al click original ya definido dentro del load del SVG — simulamos click: buscar el rect con data-seat
      // Si el SVG ya está cargado, marcar asiento. Si no, mostrar mensaje.
      const svgObj = document.getElementById('svgMapa');
      if (svgObj && svgObj.contentDocument) {
        const seatRect = svgObj.contentDocument.querySelector(`rect[data-seat='${maybeNum}']`);
        if (seatRect) {
          // Reutilizar la función marcarAsiento si está en scope — está dentro del load handler, por lo que puede no ser accesible aquí.
          // Intentaremos dispatch de un evento personalizado para que el handler dentro de load lo procese.
          const ev = new CustomEvent('marcar-asiento-externo', { detail: { numero: maybeNum } });
          svgObj.dispatchEvent(ev);
          return;
        } else {
          mainInfo.textContent = `❌ Asiento num ${maybeNum} no encontrado en el mapa.`;
          return;
        }
      } else {
        mainInfo.textContent = '⚠️ El mapa SVG no está listo aún.';
        return;
      }
    }

    // Si no es número, búsqueda por nombre
    if (!csvData) {
      mainInfo.textContent = '⚠️ Lista de nombres no cargada aún. Intenta de nuevo en un momento.';
      return;
    }

    const matches = buscarEnCSV(csvData, val);
    if (matches.length === 0) {
      mainInfo.textContent = `❌ No se encontraron coincidencias para "${val}".`;
      return;
    }
    // Si hay múltiples, mostrar lista resumida
    if (matches.length > 1) {
      const lista = matches.slice(0, 10).map(m => `${m.asiento} → ${m.nombre} ${m.apellido}`).join('\n');
      mainInfo.textContent = `ℹ️ Se encontraron ${matches.length} coincidencias (mostrando hasta 10):\n${lista}`;
      // Intentar priorizar coincidencia exacta (nombre y apellido completos)
      const exact = matches.find(m => normalizeString((m.nombre + ' ' + m.apellido).trim()) === normalizeString(val));
      if (exact) {
        // marcar el asiento exacto
        const svgObj = document.getElementById('svgMapa');
        if (svgObj && svgObj.contentDocument) {
          svgObj.dispatchEvent(new CustomEvent('marcar-asiento-externo', { detail: { numero: parseInt(exact.asiento) } }));
        }
      }
      return;
    }

    // Uno único: marcarlo
    const seatNum = parseInt(matches[0].asiento);
    const svgObj2 = document.getElementById('svgMapa');
    if (svgObj2 && svgObj2.contentDocument) {
      svgObj2.dispatchEvent(new CustomEvent('marcar-asiento-externo', { detail: { numero: seatNum } }));
      mainInfo.textContent = `✅ Encontrado: ${matches[0].asiento} → ${matches[0].nombre} ${matches[0].apellido}`;
    } else {
      mainInfo.textContent = `⚠️ Resultado: asiento ${seatNum}. El mapa SVG no está listo aún.`;
    }
  });
}

// Escuchar evento personalizado desde fuera para marcar el asiento usando la lógica dentro del load handler
// El handler que define marcarAsiento está dentro del evento load; aquí nos limitamos a reproducir la acción
document.getElementById('svgMapa')?.addEventListener('marcar-asiento-externo', (e) => {
  try {
    const num = e.detail && e.detail.numero;
    const svgObj = document.getElementById('svgMapa');
    const svgDoc = svgObj && svgObj.contentDocument;
    if (!svgDoc || !num) return;

    // Asegurar overlay (igual que en el load handler)
    let overlay = svgDoc.getElementById('overlay-marks');
    const svgRoot = svgDoc.documentElement;
    if (!overlay) {
      overlay = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'g');
      overlay.setAttribute('id', 'overlay-marks');
      overlay.setAttribute('stroke', 'red');
      overlay.setAttribute('stroke-width', '2');
      svgRoot.appendChild(overlay);
    }

    // Limpiar overlay
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);

    // Restaurar color del último asiento seleccionado (almacenado en la propiedad del elemento svgObj)
    try {
      const last = svgObj._lastSeat;
      if (last && last instanceof svgDoc.defaultView.SVGElement) {
        const orig = last.getAttribute('data-orig-fill') || last.getAttribute('fill') || '#fff';
        last.setAttribute('fill', orig);
      }
    } catch (_) {
      // ignore
    }

    const seat = svgDoc.querySelector(`rect[data-seat='${num}']`);
    if (!seat) {
      if (mainInfo) mainInfo.textContent = `❌ Asiento ${num} no encontrado en el mapa.`;
      return;
    }

    // Guardar color original si no existe
    if (!seat.getAttribute('data-orig-fill')) {
      seat.setAttribute('data-orig-fill', seat.getAttribute('fill') || '#ffffff');
    }

    // Cambiar color del asiento seleccionado
    seat.setAttribute('fill', '#ff9800');
    // Guardarlo como último
    svgObj._lastSeat = seat;

    const x = parseFloat(seat.getAttribute('x')) || 0;
    const y = parseFloat(seat.getAttribute('y')) || 0;
    const w = parseFloat(seat.getAttribute('width')) || 0;
    const h = parseFloat(seat.getAttribute('height')) || 0;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const offset = Math.min(w, h) / 2 || 6;

    const line1 = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', cx - offset);
    line1.setAttribute('y1', cy - offset);
    line1.setAttribute('x2', cx + offset);
    line1.setAttribute('y2', cy + offset);

    const line2 = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', cx - offset);
    line2.setAttribute('y1', cy + offset);
    line2.setAttribute('x2', cx + offset);
    line2.setAttribute('y2', cy - offset);

    overlay.appendChild(line1);
    overlay.appendChild(line2);

    const row = seat.getAttribute('data-row');
    const col = seat.getAttribute('data-col');
    if (mainInfo) mainInfo.textContent = `✅ Asiento ${num}` + (row && col ? ` → Fila ${row}, Columna ${col}` : '');
  } catch (err) {
    console.error('Error en marcar-asiento-externo:', err);
  }
});

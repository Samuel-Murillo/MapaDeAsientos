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
        lastSeat.setAttribute("fill", "#fff"); // color original, ajusta si es necesario
      }

      const seat = svgDoc.querySelector(`rect[data-seat='${numero}']`);
      if (!seat) {
        info.textContent = `❌ Asiento ${numero} no encontrado`;
        return;
      }

      // Cambiar color del asiento seleccionado
      seat.setAttribute("fill", "#ff9800"); // naranja
      lastSeat = seat;

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

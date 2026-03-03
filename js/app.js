if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}

    const registros = [];
    let ultimoCodigo = '';
    let ultimoMomento = 0;
    let codigoPendiente = null;
    let modalAbierta = false;

    const $ = (id) => document.getElementById(id);
    const tbody = $('tbody');
    const totalRegistros = $('totalRegistros');
    const statusEl = $('status');
    const scanState = $('scanState');

    function fmtDate(d) {
      return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'medium' }).format(d);
    }

    function actualizarTabla() {
      tbody.innerHTML = '';
      registros.forEach((r, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${i + 1}</td>
          <td>${r.codigo}</td>
          <td>${r.cantidad}</td>
          <td>${r.serie}</td>
          <td>${r.fecha}</td>
        `;
        tbody.appendChild(tr);
      });
      totalRegistros.textContent = registros.length;
    }

    function abrirModal(codigo) {
      modalAbierta = true;
      codigoPendiente = codigo;
      $('codigoDetectado').textContent = `Código detectado: ${codigo}`;
      $('cantidadInput').value = '';
      $('serieInput').value = '';
      $('modalWrap').style.display = 'flex';
      $('modalWrap').setAttribute('aria-hidden', 'false');
      $('cantidadInput').focus();
    }

    function cerrarModal() {
      modalAbierta = false;
      codigoPendiente = null;
      $('modalWrap').style.display = 'none';
      $('modalWrap').setAttribute('aria-hidden', 'true');
      statusEl.textContent = 'Escáner activo. Esperando siguiente QR…';
    }

    $('cancelBtn').addEventListener('click', cerrarModal);

    $('guardarBtn').addEventListener('click', () => {
      const cantidad = Number($('cantidadInput').value);
      const serie = $('serieInput').value.trim();

      if (!codigoPendiente) return;
      if (!cantidad || cantidad <= 0) {
        alert('Introduce una cantidad válida mayor que 0.');
        return;
      }
      if (!serie) {
        alert('Introduce el número de serie destino.');
        return;
      }

      registros.push({
        codigo: codigoPendiente,
        cantidad,
        serie,
        fecha: fmtDate(new Date())
      });

      actualizarTabla();
      cerrarModal();
    });

    function escapeHtml(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function generarTablaHTMLSimple() {
      const estiloTabla = 'border-collapse:collapse;width:100%;';
      const estiloHeader = 'border:1px solid #000;padding:6px;text-align:left;font-weight:700;';
      const estiloCelda = 'border:1px solid #000;padding:6px;text-align:left;';

      const head = '<tr>' +
        '<th style="' + estiloHeader + '">#</th>' +
        '<th style="' + estiloHeader + '">Código componente</th>' +
        '<th style="' + estiloHeader + '">Cantidad</th>' +
        '<th style="' + estiloHeader + '">Nº serie destino</th>' +
        '<th style="' + estiloHeader + '">Fecha/hora</th>' +
      '</tr>';

      const body = registros.map((r, i) => '<tr>' +
        `<td style="${estiloCelda}">${i + 1}</td>` +
        `<td style="${estiloCelda}">${escapeHtml(r.codigo)}</td>` +
        `<td style="${estiloCelda}">${escapeHtml(r.cantidad)}</td>` +
        `<td style="${estiloCelda}">${escapeHtml(r.serie)}</td>` +
        `<td style="${estiloCelda}">${escapeHtml(r.fecha)}</td>` +
      '</tr>').join('');

      return `<table style="${estiloTabla}"><thead>${head}</thead><tbody>${body}</tbody></table>`;
    }

    function generarTablaTextoSimple() {
      const encabezado = '# | Código componente | Cantidad | Nº serie destino | Fecha/hora';
      const filas = registros.map((r, i) => `${i + 1} | ${r.codigo} | ${r.cantidad} | ${r.serie} | ${r.fecha}`);
      return [encabezado, ...filas].join('\n');
    }

    async function copiarTablaAlPortapapeles(htmlTabla, textoPlano) {
      if (!navigator.clipboard) return false;

      try {
        if (window.ClipboardItem) {
          const item = new ClipboardItem({
            'text/html': new Blob([htmlTabla], { type: 'text/html' }),
            'text/plain': new Blob([textoPlano], { type: 'text/plain' })
          });
          await navigator.clipboard.write([item]);
        } else {
          await navigator.clipboard.writeText(textoPlano);
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    async function copiarTablaInventario() {
      if (!registros.length) {
        alert('No hay registros todavía.');
        return false;
      }

      const htmlTabla = generarTablaHTMLSimple();
      const textoPlano = generarTablaTextoSimple();
      const copiado = await copiarTablaAlPortapapeles(htmlTabla, textoPlano);

      if (copiado) {
        alert('Tabla copiada. Ya puedes pegarla donde quieras.');
      } else {
        alert('No se pudo copiar con formato enriquecido automáticamente en este dispositivo.');
      }
      return copiado;
    }

    $('copyBtn').addEventListener('click', copiarTablaInventario);

    $('mailBtn').addEventListener('click', async () => {
      const copiado = await copiarTablaInventario();
      if (!registros.length) return;

      const asunto = encodeURIComponent(`Inventario QR (${registros.length} registros)`);
      const cuerpo = copiado
        ? encodeURIComponent('La tabla de inventario ya está copiada en tu portapapeles.\nPégala en el cuerpo del correo (Paste/Pegar).')
        : encodeURIComponent('No se pudo copiar formato enriquecido automáticamente.\nPuedes copiar manualmente la tabla visible en la app.');

      window.location.href = `mailto:?subject=${asunto}&body=${cuerpo}`;
    });

    function onScanSuccess(decodedText) {
      const ahora = Date.now();
      const duplicadoReciente = decodedText === ultimoCodigo && (ahora - ultimoMomento) < 2500;
      if (modalAbierta || duplicadoReciente) return;

      ultimoCodigo = decodedText;
      ultimoMomento = ahora;
      statusEl.textContent = `QR detectado: ${decodedText}`;
      abrirModal(decodedText);
    }


    function obtenerTrackActivoDelReader() {
      const video = document.querySelector('#reader video');
      const stream = video?.srcObject;
      const track = stream?.getVideoTracks?.()[0];
      return track || null;
    }

    async function aplicarAutoenfoque(track) {
      if (!track?.getCapabilities || !track?.applyConstraints) return false;

      const caps = track.getCapabilities();
      const advanced = [];
      if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
        advanced.push({ focusMode: 'continuous' });
      }
      if (caps.focusDistance) {
        advanced.push({ focusDistance: caps.focusDistance.max });
      }

      if (!advanced.length) return false;

      await track.applyConstraints({ advanced });
      return true;
    }

    async function intentarConfigurarAutoenfoque() {
      for (let i = 0; i < 6; i += 1) {
        const track = obtenerTrackActivoDelReader();
        if (track) {
          try {
            const ok = await aplicarAutoenfoque(track);
            if (ok) {
              statusEl.textContent = 'Autoenfoque activado. Escanea con la cámara trasera.';
            }
            return;
          } catch (_) {
            return;
          }
        }
        await new Promise(r => setTimeout(r, 250));
      }
    }

    function esDispositivoIOS() {
      return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function elegirCamaraTrasera(camaras) {
      const porEtiqueta = camaras.find(c => /(back|rear|environment|trasera)/i.test(c.label || ''));
      return porEtiqueta || camaras[0];
    }

    async function iniciarConFallback(html5QrCode, camaras, config) {
      const camaraPreferida = elegirCamaraTrasera(camaras);
      const intentos = [
        camaraPreferida?.id,
        { facingMode: 'environment' },
        camaras[0]?.id
      ].filter(Boolean);

      let ultimoError;
      for (const objetivo of intentos) {
        try {
          await html5QrCode.start(objetivo, config, onScanSuccess, () => {});
          return;
        } catch (e) {
          ultimoError = e;
        }
      }

      throw ultimoError || new Error('No se pudo iniciar el lector QR.');
    }

    async function iniciarScanner() {
      try {
        const html5QrCode = new Html5Qrcode('reader');
        const cams = await Html5Qrcode.getCameras();
        if (!cams?.length) throw new Error('No se detectaron cámaras.');

        const esIOS = esDispositivoIOS();
        const configEscaneo = {
          fps: esIOS ? 7 : 10,
          aspectRatio: 1.333,
          experimentalFeatures: { useBarCodeDetectorIfSupported: !esIOS }
        };

        if (!esIOS) {
          configEscaneo.qrbox = { width: 240, height: 240 };
        } else {
          statusEl.textContent = 'Modo iPhone/iPad activado: acerca el QR y manténlo estable 1-2 segundos.';
        }

        await iniciarConFallback(html5QrCode, cams, configEscaneo);
        await intentarConfigurarAutoenfoque();

        scanState.textContent = 'Escáner activo';
        if (!esIOS) {
          statusEl.textContent = 'Escáner activo. Esperando primer QR…';
        }
      } catch (err) {
        scanState.textContent = 'Error de cámara';
        statusEl.textContent = `No se pudo abrir la cámara: ${err.message || err}`;
      }
    }

    window.addEventListener('load', iniciarScanner);

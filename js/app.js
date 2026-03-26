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
let modoManual = false;
let html5QrCodeInstance = null;
let scannerPausado = false;
let streamNativo = null;
let videoNativo = null;
let detectorNativo = null;
let scanNativoActivo = false;
let canvasNativo = null;
let ctxNativo = null;

const $ = (id) => document.getElementById(id);
const tbody = $('tbody');
const totalRegistros = $('totalRegistros');
const statusEl = $('status');
const scanState = $('scanState');
const retryCameraBtn = $('retryCameraBtn');

const QR_LIB_URLS = [
  './js/vendor/html5-qrcode.min.js',
  'https://unpkg.com/html5-qrcode@2.3.10/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.10/html5-qrcode.min.js'
];

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

async function pausarScanner() {
  if (scannerPausado) return;

  if (html5QrCodeInstance) {
    try {
      await html5QrCodeInstance.pause(true);
    } catch (_) {}
  }

  scannerPausado = true;
  scanState.textContent = 'Escáner en pausa';
}

async function reanudarScanner() {
  if (!scannerPausado) return;

  if (html5QrCodeInstance) {
    try {
      await html5QrCodeInstance.resume();
    } catch (_) {}
  }

  scannerPausado = false;
  scanState.textContent = 'Escáner activo';
  statusEl.textContent = 'Escáner activo. Esperando siguiente QR…';
}

async function abrirModal(codigo = '', manual = false) {
  await pausarScanner();

  modalAbierta = true;
  modoManual = manual;
  codigoPendiente = manual ? null : codigo;

  $('modalTitle').textContent = manual ? 'Registrar material manualmente' : 'Registrar material escaneado';
  $('codigoDetectado').textContent = manual
    ? 'Introduce el código de componente cuando el material no tenga QR o lo haya perdido.'
    : `Código detectado: ${codigo}`;

  $('codigoInput').value = manual ? '' : codigo;
  $('codigoInput').readOnly = !manual;
  $('cantidadInput').value = '';
  $('serieInput').value = '';
  $('modalWrap').style.display = 'flex';
  $('modalWrap').setAttribute('aria-hidden', 'false');

  if (manual) {
    $('codigoInput').focus();
  } else {
    $('cantidadInput').focus();
  }
}

async function cerrarModal() {
  modalAbierta = false;
  codigoPendiente = null;
  modoManual = false;
  $('modalWrap').style.display = 'none';
  $('modalWrap').setAttribute('aria-hidden', 'true');
  await reanudarScanner();
}

$('cancelBtn').addEventListener('click', cerrarModal);
$('manualBtn').addEventListener('click', () => abrirModal('', true));

$('guardarBtn').addEventListener('click', async () => {
  const codigo = (modoManual ? $('codigoInput').value : codigoPendiente || $('codigoInput').value).trim();
  const cantidad = Number($('cantidadInput').value);
  const serie = $('serieInput').value.trim();

  if (!codigo) {
    alert('Introduce un código de componente válido.');
    return;
  }
  if (!cantidad || cantidad <= 0) {
    alert('Introduce una cantidad válida mayor que 0.');
    return;
  }
  if (!serie) {
    alert('Introduce el número de serie destino.');
    return;
  }

  registros.push({
    codigo,
    cantidad,
    serie,
    fecha: fmtDate(new Date())
  });

  actualizarTabla();
  await cerrarModal();
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

async function onScanSuccess(decodedText) {
  const ahora = Date.now();
  const duplicadoReciente = decodedText === ultimoCodigo && (ahora - ultimoMomento) < 2500;
  if (modalAbierta || duplicadoReciente) return;

  ultimoCodigo = decodedText;
  ultimoMomento = ahora;
  statusEl.textContent = `QR detectado: ${decodedText}`;
  await abrirModal(decodedText, false);
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

function detenerScannerNativo() {
  scanNativoActivo = false;
  detectorNativo = null;
  ctxNativo = null;
  canvasNativo = null;
  videoNativo = null;

  if (streamNativo) {
    streamNativo.getTracks().forEach((track) => track.stop());
    streamNativo = null;
  }
}

function detectarConJsQR() {
  if (!window.jsQR || !videoNativo || !canvasNativo || !ctxNativo) return null;
  if (!videoNativo.videoWidth || !videoNativo.videoHeight) return null;

  if (canvasNativo.width !== videoNativo.videoWidth || canvasNativo.height !== videoNativo.videoHeight) {
    canvasNativo.width = videoNativo.videoWidth;
    canvasNativo.height = videoNativo.videoHeight;
  }

  ctxNativo.drawImage(videoNativo, 0, 0, canvasNativo.width, canvasNativo.height);
  const imageData = ctxNativo.getImageData(0, 0, canvasNativo.width, canvasNativo.height);
  const codigo = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
  return codigo?.data || null;
}

async function escanearConDetectorNativo() {
  if (!scanNativoActivo || scannerPausado || !videoNativo) return;

  try {
    let texto = null;
    if (detectorNativo) {
      const codigos = await detectorNativo.detect(videoNativo);
      texto = codigos?.[0]?.rawValue || null;
    } else {
      texto = detectarConJsQR();
    }

    if (texto) {
      await onScanSuccess(texto);
    }
  } catch (_) {
    // Ignoramos frames no legibles.
  }

  if (scanNativoActivo) {
    requestAnimationFrame(escanearConDetectorNativo);
  }
}

async function iniciarScannerNativo() {
  const reader = document.getElementById('reader');
  if (!reader) throw new Error('No existe contenedor para la cámara.');

  detenerScannerNativo();
  reader.innerHTML = '';

  streamNativo = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  });

  videoNativo = document.createElement('video');
  videoNativo.setAttribute('playsinline', 'true');
  videoNativo.autoplay = true;
  videoNativo.muted = true;
  videoNativo.srcObject = streamNativo;
  videoNativo.style.width = '100%';
  videoNativo.style.borderRadius = '14px';
  reader.appendChild(videoNativo);
  canvasNativo = document.createElement('canvas');
  ctxNativo = canvasNativo.getContext('2d', { willReadFrequently: true });

  await videoNativo.play();

  if (typeof window.BarcodeDetector === 'function') {
    detectorNativo = new BarcodeDetector({ formats: ['qr_code'] });
    scanNativoActivo = true;
    requestAnimationFrame(escanearConDetectorNativo);
    statusEl.textContent = 'Escáner activo (modo nativo). Esperando primer QR…';
  } else if (typeof window.jsQR === 'function') {
    detectorNativo = null;
    scanNativoActivo = true;
    requestAnimationFrame(escanearConDetectorNativo);
    statusEl.textContent = 'Escáner activo (modo jsQR local). Esperando primer QR…';
  } else {
    detectorNativo = null;
    statusEl.textContent = 'Cámara abierta, pero sin motor de escaneo. Copia jsQR.js en /js o usa introducir código manualmente.';
  }
}

function mostrarBotonReintento(mostrar) {
  if (!retryCameraBtn) return;
  retryCameraBtn.style.display = mostrar ? 'inline-flex' : 'none';
}

function cargarScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(script);
  });
}

async function asegurarLibreriaQr() {
  if (window.Html5Qrcode) return;

  let ultimoError;
  for (const url of QR_LIB_URLS) {
    try {
      await cargarScript(url);
      if (window.Html5Qrcode) return;
    } catch (err) {
      ultimoError = err;
    }
  }

  throw ultimoError || new Error('No se pudo cargar la librería de escaneo QR.');
}

function validarEntornoCamara() {
  if (!window.isSecureContext) {
    throw new Error('La cámara solo funciona en HTTPS o localhost.');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este navegador no soporta acceso a cámara.');
  }
}

async function iniciarScanner() {
  try {
    mostrarBotonReintento(false);
    validarEntornoCamara();
    detenerScannerNativo();

    if (html5QrCodeInstance?.isScanning) {
      await html5QrCodeInstance.stop();
    }

    try {
      await asegurarLibreriaQr();

      html5QrCodeInstance = new Html5Qrcode('reader');
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

      await iniciarConFallback(html5QrCodeInstance, cams, configEscaneo);
      await intentarConfigurarAutoenfoque();

      scanState.textContent = 'Escáner activo';
      if (!esIOS) {
        statusEl.textContent = 'Escáner activo. Esperando primer QR…';
      }
    } catch (errorLibreria) {
      html5QrCodeInstance = null;
      await iniciarScannerNativo();
      scanState.textContent = 'Escáner activo';
    }
  } catch (err) {
    scanState.textContent = 'Error de cámara';
    statusEl.textContent = `No se pudo abrir la cámara: ${err.message || err}`;
    mostrarBotonReintento(true);
  }
}

retryCameraBtn?.addEventListener('click', iniciarScanner);
window.addEventListener('load', iniciarScanner);

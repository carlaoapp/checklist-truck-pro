/**
 * CHECKLIST TRUCK PRO - BITREM & FROTAS
 * Lógica Completa do Aplicativo
 * - Mídias em cada caixinha de item com download automático no celular
 * - Opções explícitas de Salvar (Pendente) e Concluir Vistoria
 * - Aba de Vistorias Salvas com Editar, Concluir, Compartilhar e Excluir
 * - Temas profissionais integrados do app Tudo em Dia
 */

// ==========================================
// ESTADO GLOBAL
// ==========================================
let activeChecklist = null;
let currentHistoryFilter = 'pendente'; // 'pendente' | 'concluido'
let activeTargetItemId = null; // Item sendo fotografado ou filmado no momento
let autoSaveTimeout = null;

const DEFAULT_INSPECTION_ITEMS = [
  { id: 'pneus', title: 'Pneus e Rodas', desc: 'Calibragem, sulco, estepe, porcas de roda', status: 'none', note: '' },
  { id: 'freios', title: 'Freios e Sistema de Ar', desc: 'Vazamentos, cuícas, mangueiras espirais', status: 'none', note: '' },
  { id: 'iluminacao', title: 'Iluminação & Sinalização', desc: 'Faróis, lanternas, piscas, luz de freio', status: 'none', note: '' },
  { id: 'quinta_roda', title: 'Quinta Roda / Engate', desc: 'Pinos e travas de segurança', status: 'none', note: '' },
  { id: 'fluidos', title: 'Níveis de Fluidos', desc: 'Óleo do motor, Arla 32 e água do radiador', status: 'none', note: '' },
  { id: 'amarracao', title: 'Amarração de Carga', desc: 'Lonas, travessas, cintas e catracas', status: 'none', note: '' },
  { id: 'documentos', title: 'Documentos do Veículo e CNH', desc: 'CRLV do cavalo/carretas e CNH do motorista', status: 'none', note: '' }
];

// ==========================================
// INICIALIZAÇÃO E TELA DE ENTRADA (SPLASH)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  startClientKeepAlive();
  setupEventListeners();

  // Inicializa sistema de autenticação e isolamento de motorista
  if (window.TruckAuth) {
    await window.TruckAuth.initAuth();
  }

  await initActiveChecklist();
  updateTrailer2Visibility();
  await refreshHistoryList();

  // Transição suave da tela de entrada após 1.2s
  setTimeout(dismissSplash, 1200);
});

// ==========================================
// ANTI-SLEEP / KEEP-ALIVE RENDER (7 SEGUNDOS)
// Mantém o servidor Render sempre acordado sem delay de abertura
// ==========================================
function startClientKeepAlive() {
  const pingServer = () => {
    if (!navigator.onLine) return;

    // Ping na rota interna (se hospedado no Render)
    fetch('/api/ping?t=' + Date.now(), { cache: 'no-store' }).catch(() => {});

    // Se estiver no GitHub Pages ou ambiente local, pinga a URL de produção no Render
    if (window.location.hostname.includes('github.io') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      fetch('https://checklist-truck-pro.onrender.com/api/ping?t=' + Date.now(), { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
    }
  };

  // Disparo inicial rápido (1s após carregar)
  setTimeout(pingServer, 1000);

  // Intervalo contínuo a cada 7 segundos
  setInterval(pingServer, 7000);
}

function dismissSplash() {
  const splash = document.getElementById('splashScreen');
  if (splash && !splash.classList.contains('fade-out')) {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
    }, 550);
  }
}

// ==========================================
// REQUISITO 4: SISTEMA DE TEMAS (TUDO EM DIA)
// ==========================================
function initTheme() {
  const saved = localStorage.getItem('truck_pro_theme') || 'theme-preto';
  applyTheme(saved);
}

function applyTheme(themeClass) {
  // Remove classes de tema anteriores
  const themes = ['theme-preto', 'theme-azul', 'theme-verde', 'theme-roxo', 'theme-cinza', 'theme-rosa', 'theme-claro'];
  themes.forEach(t => document.body.classList.remove(t));

  document.body.classList.add(themeClass);
  localStorage.setItem('truck_pro_theme', themeClass);

  // Atualiza borda do selecionado no modal
  document.querySelectorAll('.theme-card-option').forEach(card => {
    const isThis = card.getAttribute('onclick')?.includes(themeClass);
    card.classList.toggle('active', !!isThis);
  });
}

function openThemesModal() {
  document.getElementById('modalThemes').style.display = 'flex';
}

function closeThemesModal() {
  document.getElementById('modalThemes').style.display = 'none';
  showToast('Cor atualizada!', 'success');
}

// ==========================================
// NAVEGAÇÃO ENTRE AS 3 ABAS
// ==========================================
function switchTab(tabIndex) {
  for (let i = 1; i <= 3; i++) {
    const btn = document.getElementById(`tabBtn${i}`);
    const sec = document.getElementById(`tabContent${i}`);
    if (btn && sec) {
      if (i === tabIndex) {
        btn.classList.add('active');
        sec.classList.add('active');
      } else {
        btn.classList.remove('active');
        sec.classList.remove('active');
      }
    }
  }

  if (tabIndex === 3) {
    refreshHistoryList();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// STATUS ONLINE / OFFLINE
// ==========================================
function setupOnlineStatus() {
  const statusEl = document.getElementById('connectionStatus');
  function update() {
    if (navigator.onLine) {
      statusEl.textContent = '● Online';
      statusEl.classList.remove('is-offline');
    } else {
      statusEl.textContent = '● Modo Estrada';
      statusEl.classList.add('is-offline');
    }
  }
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

// ==========================================
// INICIALIZAÇÃO DO CHECKLIST ATIVO (PERSISTÊNCIA TOTAL)
// ==========================================
async function initActiveChecklist() {
  const currentUser = window.TruckAuth ? window.TruckAuth.getAuthUser() : null;
  const currentUserId = currentUser ? currentUser.id : null;
  const all = await window.TruckDB.getAllChecklists(currentUserId);

  const savedId = localStorage.getItem('truck_active_checklist_id');
  let current = null;

  // 1. Busca pelo ID salvo na sessão anterior
  if (savedId) {
    current = all.find(c => c.id === savedId);
    if (!current) {
      current = await window.TruckDB.getChecklist(savedId);
    }
  }

  // 2. Se não encontrou pelo ID salvo, busca a última vistoria pendente
  if (!current) {
    current = all.find(c => c.status === 'pendente');
  }

  // 3. Se não houver pendente, abre a última vistoria salva
  if (!current && all.length > 0) {
    current = all[0];
  }

  // 4. Se encontrou, garante vinculação ao usuário logado
  if (current) {
    if (currentUser && (!current.userId || current.userId === 'motorista_padrao')) {
      current.userId = currentUser.id;
      if (currentUser.name && !current.driverName) {
        current.driverName = currentUser.name;
      }
      await window.TruckDB.saveChecklist(current);
    }
    activeChecklist = current;
  } else {
    // 5. Tenta recuperar de snapshot de emergência se existir
    try {
      const emergencyRaw = localStorage.getItem('truck_emergency_active_checklist');
      if (emergencyRaw) {
        const parsed = JSON.parse(emergencyRaw);
        if (parsed && parsed.id) {
          activeChecklist = parsed;
          await window.TruckDB.saveChecklist(activeChecklist);
        }
      }
    } catch (e) {}

    // 6. Se ainda for nulo (primeiro uso do app), cria o checklist inicial
    if (!activeChecklist) {
      activeChecklist = createEmptyChecklist();
      await window.TruckDB.saveChecklist(activeChecklist);
    }
  }

  localStorage.setItem('truck_active_checklist_id', activeChecklist.id);
  window.activeChecklist = activeChecklist;

  populateFormFromActiveChecklist();
  await renderChecklistItems();
}

function createEmptyChecklist() {
  const currentUser = window.TruckAuth ? window.TruckAuth.getAuthUser() : null;
  return {
    id: `chk_${Date.now()}`,
    userId: currentUser ? currentUser.id : 'motorista_padrao',
    status: 'pendente',
    createdAt: new Date().toISOString(),
    vehicleType: 'Bitrem 9 Eixos',
    plateHorse: '',
    plateTrailer1: '',
    plateTrailer2: '',
    driverName: currentUser ? (currentUser.name || '') : '',
    currentKm: '',
    inspectionDateTime: getFormattedCurrentDateTime(),
    locationText: '',
    latitude: null,
    longitude: null,
    items: JSON.parse(JSON.stringify(DEFAULT_INSPECTION_ITEMS))
  };
}

function populateFormFromActiveChecklist() {
  if (!activeChecklist) return;

  const vType = document.getElementById('vehicleType');
  const pHorse = document.getElementById('plateHorse');
  const pTr1 = document.getElementById('plateTrailer1');
  const pTr2 = document.getElementById('plateTrailer2');
  const dName = document.getElementById('driverName');
  const km = document.getElementById('currentKm');
  const dt = document.getElementById('inspectionDateTime');
  const loc = document.getElementById('locationText');

  if (vType) vType.value = activeChecklist.vehicleType || 'Bitrem 9 Eixos';
  if (pHorse) pHorse.value = activeChecklist.plateHorse || '';
  if (pTr1) pTr1.value = activeChecklist.plateTrailer1 || '';
  if (pTr2) pTr2.value = activeChecklist.plateTrailer2 || '';
  if (dName) dName.value = activeChecklist.driverName || '';
  if (km) km.value = activeChecklist.currentKm || '';
  if (dt) dt.value = activeChecklist.inspectionDateTime || getFormattedCurrentDateTime();
  if (loc) loc.value = activeChecklist.locationText || '';

  if (activeChecklist.latitude && activeChecklist.longitude) {
    document.getElementById('locationCoords').textContent = `Coordenadas: Lat ${activeChecklist.latitude.toFixed(5)}, Lon ${activeChecklist.longitude.toFixed(5)}`;
    const linkMaps = document.getElementById('linkGoogleMaps');
    if (linkMaps) {
      linkMaps.href = `https://www.google.com/maps?q=${activeChecklist.latitude},${activeChecklist.longitude}`;
      linkMaps.style.display = 'inline-block';
    }
  } else {
    document.getElementById('locationCoords').textContent = 'Coordenadas: Nenhuma capturada ainda';
    const linkMaps = document.getElementById('linkGoogleMaps');
    if (linkMaps) linkMaps.style.display = 'none';
  }

  updateTrailer2Visibility();
}

function collectFormIntoActiveChecklist() {
  if (!activeChecklist) return;
  const currentUser = window.TruckAuth ? window.TruckAuth.getAuthUser() : null;
  if (currentUser && (!activeChecklist.userId || activeChecklist.userId === 'motorista_padrao')) {
    activeChecklist.userId = currentUser.id;
  }

  const vType = document.getElementById('vehicleType');
  const pHorse = document.getElementById('plateHorse');
  const pTr1 = document.getElementById('plateTrailer1');
  const pTr2 = document.getElementById('plateTrailer2');
  const dName = document.getElementById('driverName');
  const km = document.getElementById('currentKm');
  const dt = document.getElementById('inspectionDateTime');
  const loc = document.getElementById('locationText');

  if (vType) activeChecklist.vehicleType = vType.value;
  if (pHorse) activeChecklist.plateHorse = pHorse.value;
  if (pTr1) activeChecklist.plateTrailer1 = pTr1.value;
  if (pTr2) activeChecklist.plateTrailer2 = pTr2.value;
  if (dName) activeChecklist.driverName = dName.value;
  if (km) activeChecklist.currentKm = km.value;
  if (dt) activeChecklist.inspectionDateTime = dt.value;
  if (loc) activeChecklist.locationText = loc.value;

  // Garante leitura das anotações de cada item abertas no formulário
  if (activeChecklist.items) {
    activeChecklist.items.forEach(item => {
      const noteEl = document.querySelector(`#noteWrap_${item.id} textarea`);
      if (noteEl) {
        item.note = noteEl.value;
      }
    });
  }

  window.activeChecklist = activeChecklist;
}

// ==========================================
// FORMATAÇÃO E MÁSCARAS DE PLACA
// ==========================================
function formatLicensePlate(value) {
  if (!value) return '';
  let clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length > 7) clean = clean.substring(0, 7);

  if (clean.length > 3 && /^[A-Z]{3}[0-9]/.test(clean)) {
    if (clean.length >= 5 && /^[A-Z]{3}[0-9][A-Z]/.test(clean)) {
      return clean; // Mercosul ABC1D23
    }
    return clean.slice(0, 3) + '-' + clean.slice(3); // Antigo ABC-1234
  }
  return clean;
}

function attachPlateMask(inputEl) {
  inputEl.addEventListener('input', (e) => {
    e.target.value = formatLicensePlate(e.target.value);
    triggerAutoSave();
  });
}

function updateTrailer2Visibility() {
  const vehicleType = document.getElementById('vehicleType').value;
  const groupTrailer2 = document.getElementById('groupTrailer2');
  if (vehicleType === 'Bitrem 9 Eixos' || vehicleType === 'Rodotrem') {
    groupTrailer2.style.display = 'block';
  } else {
    const val2 = document.getElementById('plateTrailer2').value.trim();
    groupTrailer2.style.display = val2 ? 'block' : 'none';
  }
}

function getFormattedCurrentDateTime() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} - ${hours}:${minutes}`;
}

function refreshDateTimeInput() {
  const el = document.getElementById('inspectionDateTime');
  el.value = getFormattedCurrentDateTime();
  triggerAutoSave();
  showToast('⏱ Data e horário atualizados!', 'success');
}

// ==========================================
// GEOLOCALIZAÇÃO GPS
// ==========================================
function captureCurrentLocation() {
  const btn = document.getElementById('btnGetLocation');
  const locationText = document.getElementById('locationText');
  const locationCoords = document.getElementById('locationCoords');
  const linkMaps = document.getElementById('linkGoogleMaps');

  if (!navigator.geolocation) {
    showToast('Geolocalização não é suportada neste aparelho.', 'warning');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span><span>Buscando satélites GPS...</span>';

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const acc = Math.round(pos.coords.accuracy);

      activeChecklist.latitude = lat;
      activeChecklist.longitude = lon;

      locationCoords.textContent = `Coordenadas: Lat ${lat.toFixed(5)}, Lon ${lon.toFixed(5)} (~${acc}m)`;
      linkMaps.href = `https://www.google.com/maps?q=${lat},${lon}`;
      linkMaps.style.display = 'inline-block';

      if (!locationText.value.trim()) {
        locationText.value = `Posição GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      }

      btn.disabled = false;
      btn.innerHTML = `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>Localização Capturada!</span>`;
      showToast('GPS capturado com sucesso!', 'success');
      triggerAutoSave();

      setTimeout(() => {
        btn.innerHTML = `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> <span>Recapturar Localização Atual</span>`;
      }, 3000);
    },
    (err) => {
      btn.disabled = false;
      btn.innerHTML = `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> <span>Capturar Minha Localização Atual</span>`;
      console.warn('Erro GPS:', err);
      showToast('Não foi possível obter o sinal GPS. Preencha manualmente.', 'warning');
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

// ==========================================
// ==========================================
// ÍCONES REPRESENTATIVOS PARA CADA ITEM DO CHECKLIST
// ==========================================
function getItemIconSvg(itemId) {
  switch (itemId) {
    case 'pneus':
      return `<svg class="ui-icon item-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/><line x1="12" y1="2" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="22"/><line x1="2" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="22" y2="12"/></svg>`;
    case 'freios':
      return `<svg class="ui-icon item-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/><path d="M8 18h8"/></svg>`;
    case 'iluminacao':
      return `<svg class="ui-icon item-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2v2"/><path d="M12 14a4 4 0 1 0-4-4c0 1.5.8 2.8 2 3.5"/></svg>`;
    case 'quinta_roda':
      return `<svg class="ui-icon item-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
    case 'fluidos':
      return `<svg class="ui-icon item-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`;
    case 'amarracao':
      return `<svg class="ui-icon item-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
    case 'documentos':
      return `<svg class="ui-icon item-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><line x1="15" y1="8" x2="17" y2="8"/><line x1="15" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="17" y2="16"/></svg>`;
    default:
      return `<svg class="ui-icon item-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
  }
}

// ==========================================
// REQUISITO 1: RENDERIZAÇÃO DAS CAIXINHAS COM MÍDIAS DENTRO DE CADA UMA
// ==========================================
async function renderChecklistItems() {
  const container = document.getElementById('checklistContainer');
  container.innerHTML = '';

  if (!activeChecklist || !activeChecklist.items) return;

  // Busca todas as mídias salvas para este checklist
  const allMedias = await window.TruckDB.getMediaByChecklist(activeChecklist.id);

  activeChecklist.items.forEach((item) => {
    const card = document.createElement('div');
    card.className = `check-item-card status-${item.status}`;
    card.id = `checkItem_${item.id}`;

    const isNoteVisible = (item.status === 'warn' || item.status === 'danger' || item.note);

    // Filtra as mídias específicas desta caixinha
    const itemMedias = allMedias.filter(m => m.itemId === item.id);
    const itemSelectedCount = itemMedias.filter(m => m.includeInShare !== false).length;
    const itemAllSelected = itemMedias.length > 0 && itemSelectedCount === itemMedias.length;

    card.innerHTML = `
      <!-- Cabeçalho Linear e Alinhado com Ícone Representativo -->
      <div class="check-item-header-linear">
        <div class="check-item-icon-box">
          ${getItemIconSvg(item.id)}
        </div>
        <div class="check-item-text-wrap">
          <div class="check-item-title">${escapeHtml(item.title)}</div>
          ${item.desc ? `<div class="check-item-desc">${escapeHtml(item.desc)}</div>` : ''}
        </div>
        ${item.isCustom ? `
          <button type="button" class="btn-icon" style="padding: 4px 8px; font-size: 0.75rem; color: #f87171; border-color: rgba(239, 68, 68, 0.4); display: inline-flex; align-items: center; gap: 4px;" onclick="removeCustomItem('${item.id}')">
            <svg class="ui-icon" style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Excluir
          </button>
        ` : ''}
      </div>

      <!-- 3 Botões de Avaliação com Ícones Vetoriais -->
      <div class="state-selector">
        <button type="button" class="state-btn btn-ok ${item.status === 'ok' ? 'active' : ''}" onclick="setCheckItemStatus('${item.id}', 'ok')">
          <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Conforme</span>
        </button>
        <button type="button" class="state-btn btn-warn ${item.status === 'warn' ? 'active' : ''}" onclick="setCheckItemStatus('${item.id}', 'warn')">
          <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>Atenção</span>
        </button>
        <button type="button" class="state-btn btn-danger ${item.status === 'danger' ? 'active' : ''}" onclick="setCheckItemStatus('${item.id}', 'danger')">
          <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>Defeito</span>
        </button>
      </div>

      <!-- Campo de Observação -->
      <div class="check-item-note ${isNoteVisible ? 'visible' : ''}" id="noteWrap_${item.id}">
        <input type="text" placeholder="Descreva a observação técnica deste item..." value="${escapeHtml(item.note || '')}" oninput="updateCheckItemNote('${item.id}', this.value)">
      </div>

      <!-- ÁREA DE MÍDIAS DENTRO DESTA CAIXINHA -->
      <div class="item-media-section">
        <div class="item-media-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <span class="item-media-title">
            <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
            <span>Fotos e Vídeos deste Item (${itemMedias.length})</span>
          </span>
          ${itemMedias.length > 0 ? `
            <label class="custom-checkbox-label box-share-checkbox" style="width: auto; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);">
              <input type="checkbox" ${itemAllSelected ? 'checked' : ''} onchange="toggleBoxMediasShare('${item.id}', this.checked)">
              <span>Selecionar mídias deste item (${itemSelectedCount}/${itemMedias.length})</span>
            </label>
          ` : ''}
        </div>

        <div class="item-media-buttons">
          <button type="button" class="btn-item-media" onclick="triggerMediaCapture('${item.id}', 'photo', true)">
            <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
            <span>Foto</span>
          </button>
          <button type="button" class="btn-item-media" onclick="triggerMediaCapture('${item.id}', 'photo', false)">
            <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
            <span>Anexar</span>
          </button>
          <button type="button" class="btn-item-media" onclick="triggerMediaCapture('${item.id}', 'video', true)">
            <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect width="14" height="12" x="1" y="6" rx="2" ry="2"/></svg>
            <span>Vídeo</span>
          </button>
          <button type="button" class="btn-item-media" onclick="triggerMediaCapture('${item.id}', 'video', false)">
            <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="m9 8 6 4-6 4Z"/></svg>
            <span>Anexar</span>
          </button>
        </div>

        <!-- Lista de Fotos/Vídeos desta Caixinha -->
        <div class="item-media-list" id="mediaList_${item.id}">
          ${renderItemMediasHtml(itemMedias)}
        </div>

        <!-- Botão para Compartilhar Apenas este Item -->
        <button type="button" class="btn-share-item-quick" onclick="shareIndividualItem('${item.id}')">
          <svg class="ui-icon" style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          <span>Compartilhar Somente Este Item</span>
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  updateBadges();
  updateMediaShareCount();
}

function renderItemMediasHtml(medias) {
  if (!medias || medias.length === 0) {
    return `<div style="font-size: 0.78rem; color: var(--text-muted); padding: 4px 2px;">Nenhuma foto ou vídeo anexado neste item.</div>`;
  }

  return medias.map(m => {
    const blobUrl = URL.createObjectURL(m.blob);
    const isSelected = (m.includeInShare !== false);
    return `
      <div class="item-media-card ${m.resolved ? 'is-resolved' : ''}" id="mediaCard_${m.id}">
        <!-- Checkbox de Seleção para Envio -->
        <div class="media-share-toggle">
          <label class="custom-checkbox-label">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleMediaShare('${m.id}', '${m.itemId}', this.checked)">
            <span>Compartilhar foto/vídeo no WhatsApp</span>
          </label>
        </div>

        <div class="item-media-preview">
          ${m.type === 'photo'
            ? `<img src="${blobUrl}" alt="Registro Fotográfico" loading="lazy">`
            : `<video src="${blobUrl}" controls playsinline></video>`
          }
        </div>
        <input type="text" class="input-control" style="min-height: 38px; font-size: 0.85rem; padding: 6px 10px; margin-bottom: 6px;" 
               placeholder="Anotação técnica da ocorrência..." value="${escapeHtml(m.notes || '')}" oninput="updateMediaNotes('${m.id}', this.value)">
        
        <div class="item-media-actions">
          <button type="button" class="btn-media-status ${m.resolved ? 'resolved' : 'pending'}" onclick="toggleMediaResolved('${m.id}')">
            ${m.resolved ? 'Resolvido' : 'Pendente'}
          </button>
          <button type="button" class="btn-media-delete" onclick="deleteMedia('${m.id}')">
            <svg class="ui-icon" style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            <span>Excluir</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function setCheckItemStatus(itemId, newStatus) {
  const item = activeChecklist.items.find(i => i.id === itemId);
  if (!item) return;

  item.status = (item.status === newStatus) ? 'none' : newStatus;

  const card = document.getElementById(`checkItem_${itemId}`);
  if (card) {
    card.className = `check-item-card status-${item.status}`;
    const btns = card.querySelectorAll('.state-btn');
    btns[0].classList.toggle('active', item.status === 'ok');
    btns[1].classList.toggle('active', item.status === 'warn');
    btns[2].classList.toggle('active', item.status === 'danger');

    const noteWrap = document.getElementById(`noteWrap_${itemId}`);
    if (noteWrap) {
      if (item.status === 'warn' || item.status === 'danger' || item.note) {
        noteWrap.classList.add('visible');
      } else {
        noteWrap.classList.remove('visible');
      }
    }
  }

  updateBadges();
  triggerAutoSave();
}

function updateCheckItemNote(itemId, noteText) {
  const item = activeChecklist.items.find(i => i.id === itemId);
  if (item) {
    item.note = noteText;
    triggerAutoSave();
  }
}

function removeCustomItem(itemId) {
  if (confirm('Deseja remover este item da vistoria?')) {
    activeChecklist.items = activeChecklist.items.filter(i => i.id !== itemId);
    renderChecklistItems();
    triggerAutoSave();
    showToast('Item removido.', 'success');
  }
}

// ==========================================
// CAPTURA DE FOTOS/VÍDEOS POR CAIXINHA
// ==========================================
function triggerMediaCapture(itemId, mediaType, isCamera) {
  activeTargetItemId = itemId;

  let input;
  if (mediaType === 'photo') {
    input = isCamera 
      ? document.getElementById('activeCameraPhotoInput') 
      : document.getElementById('activeGalleryPhotoInput');
  } else {
    input = isCamera 
      ? document.getElementById('activeCameraVideoInput') 
      : document.getElementById('activeGalleryVideoInput');
  }

  if (input) {
    input.value = '';
    input.click();
  }
}

async function handleIncomingFiles(fileList, mediaType) {
  if (!fileList || fileList.length === 0 || !activeTargetItemId) return;

  const plate = (document.getElementById('plateHorse').value || 'CAMINHAO').replace(/[^A-Z0-9]/g, '');
  let countAdded = 0;

  for (let i = 0; i < fileList.length; i++) {
    const originalFile = fileList[i];
    const timestamp = Date.now();
    const ext = originalFile.name.split('.').pop() || (mediaType === 'photo' ? 'jpg' : 'mp4');
    const filename = `VISTORIA_${plate}_${activeTargetItemId}_${timestamp}_${i + 1}.${ext}`;

    // Salvamento AUTOMÁTICO e silencioso no banco de dados local do celular (IndexedDB - sem popups do navegador)
    const mediaItem = {
      id: `media_${timestamp}_${Math.random().toString(36).substring(2, 6)}`,
      checklistId: activeChecklist.id,
      itemId: activeTargetItemId,
      name: filename,
      type: mediaType,
      mimeType: originalFile.type || (mediaType === 'photo' ? 'image/jpeg' : 'video/mp4'),
      blob: originalFile,
      timestamp: timestamp,
      notes: '',
      resolved: false,
      includeInShare: true
    };

    await window.TruckDB.addMediaRecord(mediaItem);
    countAdded++;
  }

  // Salva o checklist ativo com os dados atuais
  collectFormIntoActiveChecklist();
  await window.TruckDB.saveChecklist(activeChecklist);

  // Re-renderiza para atualizar mídias, contadores e caixas
  await renderChecklistItems();

  updateBadges();
  await updateMediaShareCount();
  showToast(`${countAdded} mídia(s) salva(s) automaticamente!`, 'success');
}

async function updateMediaNotes(mediaId, notes) {
  await window.TruckDB.updateMediaRecord(mediaId, { notes });
}

async function toggleMediaShare(mediaId, itemId, isChecked) {
  await window.TruckDB.updateMediaRecord(mediaId, { includeInShare: isChecked });

  // Sincroniza o checkbox do cabeçalho da caixinha correspondente
  if (itemId && activeChecklist) {
    const itemMedias = await window.TruckDB.getMediaByChecklistAndItem(activeChecklist.id, itemId);
    const boxCard = document.getElementById(`checkItem_${itemId}`);
    if (boxCard) {
      const boxCheckbox = boxCard.querySelector('.box-share-checkbox input[type="checkbox"]');
      const boxText = boxCard.querySelector('.box-share-checkbox span');
      const selCount = itemMedias.filter(m => m.includeInShare !== false).length;
      if (boxCheckbox) boxCheckbox.checked = (itemMedias.length > 0 && selCount === itemMedias.length);
      if (boxText) boxText.textContent = `Selecionar mídias deste item (${selCount}/${itemMedias.length})`;
    }
  }

  await updateMediaShareCount();
}

async function toggleBoxMediasShare(itemId, isChecked) {
  if (!activeChecklist) return;
  const itemMedias = await window.TruckDB.getMediaByChecklistAndItem(activeChecklist.id, itemId);
  for (const m of itemMedias) {
    await window.TruckDB.updateMediaRecord(m.id, { includeInShare: isChecked });
  }

  const mediaListContainer = document.getElementById(`mediaList_${itemId}`);
  if (mediaListContainer) {
    const updatedMedias = await window.TruckDB.getMediaByChecklistAndItem(activeChecklist.id, itemId);
    mediaListContainer.innerHTML = renderItemMediasHtml(updatedMedias);
  }

  const boxCard = document.getElementById(`checkItem_${itemId}`);
  if (boxCard) {
    const boxCheckbox = boxCard.querySelector('.box-share-checkbox input[type="checkbox"]');
    const boxText = boxCard.querySelector('.box-share-checkbox span');
    if (boxCheckbox) boxCheckbox.checked = isChecked;
    if (boxText) {
      const count = isChecked ? itemMedias.length : 0;
      boxText.textContent = `Selecionar mídias deste item (${count}/${itemMedias.length})`;
    }
  }

  await updateMediaShareCount();
  showToast(isChecked ? 'Mídias deste item marcadas para envio.' : 'Mídias deste item desmarcadas do envio.', 'info');
}

async function toggleSelectAllMedias() {
  if (!activeChecklist) return;
  const allMedias = await window.TruckDB.getMediaByChecklist(activeChecklist.id);
  if (allMedias.length === 0) {
    showToast('Nenhuma foto ou vídeo anexado ainda.', 'info');
    return;
  }

  // Se houver qualquer mídia desmarcada, seleciona todas. Caso contrário, desmarca todas.
  const hasUnselected = allMedias.some(m => m.includeInShare === false);
  const targetState = hasUnselected;

  for (const m of allMedias) {
    await window.TruckDB.updateMediaRecord(m.id, { includeInShare: targetState });
  }

  // Atualiza as caixinhas e o contador
  await renderChecklistItems();
  await updateMediaShareCount();
}

async function updateMediaShareCount() {
  if (!activeChecklist) return;
  const allMedias = await window.TruckDB.getMediaByChecklist(activeChecklist.id);
  const selectedCount = allMedias.filter(m => m.includeInShare !== false).length;
  const countEl = document.getElementById('mediaShareCountText');
  if (countEl) {
    countEl.textContent = `Mídias: ${selectedCount} de ${allMedias.length} selecionadas para envio`;
  }
}

async function toggleMediaResolved(mediaId) {
  const all = await window.TruckDB.getMediaByChecklist(activeChecklist.id);
  const item = all.find(m => m.id === mediaId);
  if (!item) return;

  const newResolved = !item.resolved;
  await window.TruckDB.updateMediaRecord(mediaId, { resolved: newResolved });

  // Re-renderiza a lista da caixinha
  const itemMedias = await window.TruckDB.getMediaByChecklistAndItem(activeChecklist.id, item.itemId);
  const mediaListContainer = document.getElementById(`mediaList_${item.itemId}`);
  if (mediaListContainer) {
    mediaListContainer.innerHTML = renderItemMediasHtml(itemMedias);
  }

  showToast(newResolved ? 'Marcado como RESOLVIDO!' : 'Status revertido para PENDENTE.', 'success');
}

async function deleteMedia(mediaId) {
  if (confirm('Deseja excluir esta mídia deste item?')) {
    const all = await window.TruckDB.getMediaByChecklist(activeChecklist.id);
    const item = all.find(m => m.id === mediaId);
    if (!item) return;

    await window.TruckDB.deleteMediaRecord(mediaId);

    const itemMedias = await window.TruckDB.getMediaByChecklistAndItem(activeChecklist.id, item.itemId);
    const mediaListContainer = document.getElementById(`mediaList_${item.itemId}`);
    if (mediaListContainer) {
      mediaListContainer.innerHTML = renderItemMediasHtml(itemMedias);
    }

    updateBadges();
    await updateMediaShareCount();
    showToast('Mídia excluída.', 'success');
  }
}

// ==========================================
// REQUISITO 2: BOTÕES EXPLÍCITOS DE SALVAR E CONCLUIR
// ==========================================
async function saveCurrentChecklistDraft() {
  collectFormIntoActiveChecklist();
  activeChecklist.status = 'pendente';
  await window.TruckDB.saveChecklist(activeChecklist);

  await refreshHistoryList();
  showToast('Checklist salvo com sucesso na aba Vistorias (Pendentes)!', 'success');
}

async function concludeCurrentChecklist() {
  collectFormIntoActiveChecklist();
  
  if (!activeChecklist.plateHorse.trim()) {
    showToast('Por favor, informe ao menos a Placa do Cavalo na Aba 1.', 'warning');
    switchTab(1);
    return;
  }

  activeChecklist.status = 'concluido';
  await window.TruckDB.saveChecklist(activeChecklist);

  await refreshHistoryList();
  showToast('Vistoria Concluída com Sucesso!', 'success');
  switchTab(3); // Vai diretamente para a aba de Vistorias Salvas
}

// ==========================================
// REQUISITO 3: ABA DE VISTORIAS (HISTÓRICO PENDENTES & CONCLUÍDAS)
// ==========================================
function setHistoryFilter(filter) {
  currentHistoryFilter = filter;
  document.getElementById('filterPendingBtn').classList.toggle('active', filter === 'pendente');
  document.getElementById('filterConcludedBtn').classList.toggle('active', filter === 'concluido');
  renderHistoryView();
}

async function refreshHistoryList() {
  const currentUser = window.TruckAuth ? window.TruckAuth.getAuthUser() : null;
  const currentUserId = currentUser ? currentUser.id : null;
  const allChecklists = await window.TruckDB.getAllChecklists(currentUserId);

  const pendingList = allChecklists.filter(c => c.status === 'pendente');
  const concludedList = allChecklists.filter(c => c.status === 'concluido');

  document.getElementById('pendingCountBadge').textContent = pendingList.length;
  document.getElementById('concludedCountBadge').textContent = concludedList.length;
  document.getElementById('tab3Badge').textContent = pendingList.length;
  document.getElementById('tab3Badge').style.display = pendingList.length > 0 ? 'inline-block' : 'none';

  renderHistoryView(allChecklists);
}

async function renderHistoryView(allChecklists = null) {
  if (!allChecklists) {
    allChecklists = await window.TruckDB.getAllChecklists();
  }

  const container = document.getElementById('historyListContainer');
  const emptyNotice = document.getElementById('emptyHistoryNotice');
  container.innerHTML = '';

  const filtered = allChecklists.filter(c => c.status === currentHistoryFilter);

  if (filtered.length === 0) {
    emptyNotice.style.display = 'block';
    return;
  }

  emptyNotice.style.display = 'none';

  for (const item of filtered) {
    const medias = await window.TruckDB.getMediaByChecklist(item.id);
    const defectCount = (item.items || []).filter(i => i.status === 'danger' || i.status === 'warn').length;
    const okCount = (item.items || []).filter(i => i.status === 'ok').length;

    const card = document.createElement('div');
    card.className = `history-card is-${item.status}`;
    card.innerHTML = `
      <div class="history-card-header">
        <span class="history-card-plate">${item.plateHorse || 'SEM PLACA'}</span>
        <span class="history-status-badge ${item.status}">
          ${item.status === 'pendente' ? 'Pendente' : 'Concluída'}
        </span>
      </div>

      <div class="history-card-details">
        <div><strong>Conjunto:</strong> ${item.vehicleType || 'Não informado'}</div>
        <div><strong>Motorista:</strong> ${item.driverName || 'Não informado'} | <strong>KM:</strong> ${item.currentKm || '---'}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
          Data: ${item.inspectionDateTime || '---'} | Local: ${item.locationText || 'Não informado'}
        </div>
      </div>

      <div class="history-card-stats">
        <span class="stat-pill">${okCount} Conformes</span>
        <span class="stat-pill ${defectCount > 0 ? 'has-defects' : ''}">${defectCount} Avarias</span>
        <span class="stat-pill">${medias.length} Mídias</span>
      </div>

      <!-- 4 Ações por Vistoria: Editar, Concluir/Reabrir, Compartilhar, Excluir -->
      <div class="history-card-actions">
        <button type="button" class="btn-hist-action btn-hist-edit" onclick="loadChecklistForEdit('${item.id}')">
          <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          <span>Editar</span>
        </button>

        ${item.status === 'pendente' 
          ? `<button type="button" class="btn-hist-action btn-hist-conclude" onclick="markChecklistStatus('${item.id}', 'concluido')">
               <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
               <span>Concluir</span>
             </button>`
          : `<button type="button" class="btn-hist-action" style="background: rgba(245, 158, 11, 0.15); border-color: #f59e0b; color: #fbbf24;" onclick="markChecklistStatus('${item.id}', 'pendente')">
               <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
               <span>Reabrir</span>
             </button>`
        }

        <button type="button" class="btn-hist-action btn-hist-share" onclick="shareReportViaWhatsApp('${item.id}')">
          <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
          <span>WhatsApp</span>
        </button>

        <button type="button" class="btn-hist-action btn-hist-delete" onclick="deleteHistoryChecklist('${item.id}')">
          <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span>Excluir</span>
        </button>
      </div>
    `;

    container.appendChild(card);
  }
}

async function loadChecklistForEdit(checklistId) {
  const item = await window.TruckDB.getChecklist(checklistId);
  if (!item) {
    showToast('Checklist não encontrado.', 'warning');
    return;
  }

  activeChecklist = item;
  window.activeChecklist = activeChecklist;
  localStorage.setItem('truck_active_checklist_id', item.id);
  populateFormFromActiveChecklist();
  await renderChecklistItems();
  switchTab(2); // Leva para a aba de Vistoria
  showToast(`Checklist da placa ${item.plateHorse || ''} carregado para edição.`, 'success');
}

async function markChecklistStatus(checklistId, newStatus) {
  await window.TruckDB.updateChecklistStatus(checklistId, newStatus);
  if (activeChecklist && activeChecklist.id === checklistId) {
    activeChecklist.status = newStatus;
  }
  await refreshHistoryList();
  showToast(`Vistoria marcada como ${newStatus === 'concluido' ? 'CONCLUÍDA' : 'PENDENTE'}.`, 'success');
}

async function deleteHistoryChecklist(checklistId) {
  if (confirm('Tem certeza de que deseja excluir permanentemente esta vistoria e todas as suas fotos/vídeos?')) {
    await window.TruckDB.deleteChecklist(checklistId);
    if (activeChecklist && activeChecklist.id === checklistId) {
      localStorage.removeItem('truck_active_checklist_id');
      activeChecklist = createEmptyChecklist();
      window.activeChecklist = activeChecklist;
      populateFormFromActiveChecklist();
      await renderChecklistItems();
    }
    await refreshHistoryList();
    showToast('Vistoria excluída.', 'success');
  }
}

// ==========================================
// CENTRAL DE COMPARTILHAMENTO & PRÉVIA COM MÍDIAS
// ==========================================
let currentModalShareData = {
  checklist: null,
  medias: [],
  text: '',
  files: [],
  selectedItemIds: new Set(),
  filterMode: 'all'
};

function formatChecklistReportText(chk, medias, includedItemIds = null) {
  if (!chk) return '';
  const mediaList = medias || [];
  
  // Se houver filtro de itens selecionados, inclui apenas os marcados
  const itemsToInclude = (chk.items || []).filter(item => {
    if (!includedItemIds || includedItemIds.size === 0) return true;
    return includedItemIds.has(item.id);
  });

  const includedIdsSet = new Set(itemsToInclude.map(i => i.id));
  const relevantMedias = mediaList.filter(m => includedIdsSet.has(m.itemId));
  const selectedMedias = relevantMedias.filter(m => m.includeInShare !== false);

  let report = `*RELATÓRIO DE VISTORIA VEICULAR - TRUCK PRO*\n`;
  report += `Data/Hora: ${chk.inspectionDateTime || getFormattedCurrentDateTime()}\n`;
  report += `Status: *${chk.status === 'concluido' ? 'CONCLUÍDO' : 'PENDENTE'}*\n`;
  report += `--------------------------------------\n`;
  report += `*IDENTIFICAÇÃO DO CONJUNTO:*\n`;
  report += `• Tipo: ${chk.vehicleType || 'Não informado'}\n`;
  report += `• Cavalo Mecânico: ${(chk.plateHorse || 'Não informada').toUpperCase()}\n`;
  report += `• Semirreboque 1: ${(chk.plateTrailer1 || 'Não informada').toUpperCase()}\n`;
  if (chk.plateTrailer2) {
    report += `• Semirreboque 2: ${chk.plateTrailer2.toUpperCase()}\n`;
  }
  report += `• Motorista: ${chk.driverName || 'Não informado'}\n`;
  report += `• KM / Horímetro: ${chk.currentKm || '---'}\n`;
  report += `• Localização: ${chk.locationText || 'Não informado'}\n`;
  if (chk.latitude && chk.longitude) {
    report += `• Mapa GPS: https://www.google.com/maps?q=${chk.latitude},${chk.longitude}\n`;
  }
  report += `--------------------------------------\n`;

  report += `*ITENS VISTORIADOS (${itemsToInclude.length} itens):*\n`;
  itemsToInclude.forEach(item => {
    let tag = '⚪ [NÃO VERIFICADO]';
    if (item.status === 'ok') {
      tag = '🟢 [CONFORME / OK]';
    } else if (item.status === 'warn') {
      tag = '🟡 [ATENÇÃO / ALERTA]';
    } else if (item.status === 'danger') {
      tag = '🔴 [DEFEITO / NÃO CONFORME]';
    }

    report += `${tag} ${item.title}`;
    if (item.note && item.note.trim()) {
      report += ` (Obs: ${item.note.trim()})`;
    }
    report += `\n`;
  });

  report += `--------------------------------------\n`;
  report += `*MÍDIAS ANEXADAS (${selectedMedias.length} de ${relevantMedias.length} selecionadas):*\n`;
  if (relevantMedias.length === 0) {
    report += `Nenhum anexo registrado para os itens selecionados.\n`;
  } else {
    relevantMedias.forEach((m, idx) => {
      const parentItem = (chk.items || []).find(i => i.id === m.itemId);
      const itemTitle = parentItem ? parentItem.title : 'Item';
      const statusIcon = m.resolved ? '✅ [RESOLVIDO]' : '⚠️ [PENDENTE]';
      const typeStr = m.type === 'photo' ? '📷 Foto' : '🎥 Vídeo';
      const shareIndicator = (m.includeInShare !== false) ? '✓ [ENVIADO]' : '✗ [NÃO ENVIADO]';
      report += `${idx + 1}. [${itemTitle}] ${typeStr} - ${statusIcon} ${shareIndicator}\n`;
      if (m.notes && m.notes.trim()) {
        report += `   ↳ Obs: ${m.notes.trim()}\n`;
      }
    });
  }

  report += `--------------------------------------\n`;
  report += `Gerado via Checklist Truck Pro`;
  return report;
}

async function generateChecklistReportText(checklistId) {
  const targetId = checklistId || (activeChecklist ? activeChecklist.id : null);
  if (!targetId) return '';
  const [chk, medias] = await Promise.all([
    window.TruckDB.getChecklist(targetId),
    window.TruckDB.getMediaByChecklist(targetId)
  ]);
  return formatChecklistReportText(chk || activeChecklist, medias);
}

// ==========================================
// OTIMIZAÇÃO E COMPARTILHAMENTO DIRETO DE FOTOS/VÍDEOS COM TEXTO NO WHATSAPP
// ==========================================

// Comprime foto para envio leve e ultra-rápido no WhatsApp (evita estourar limite do Android)
function compressImageForShare(blob, maxWidth = 1280, maxHeight = 1280, quality = 0.8) {
  return new Promise((resolve) => {
    if (!blob) { resolve(null); return; }
    try {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((compressedBlob) => {
          resolve(compressedBlob || blob);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(blob);
      };
      img.src = url;
    } catch (e) {
      resolve(blob);
    }
  });
}

// Extrai quadro representativo de vídeo para envio de imagem no WhatsApp
function extractVideoFrameForShare(blob, maxWidth = 1280, maxHeight = 1280, quality = 0.8) {
  return new Promise((resolve) => {
    if (!blob) { resolve(null); return; }
    try {
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.src = url;
      video.currentTime = 0.5;

      const timeout = setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve(null);
      }, 4000);

      video.onloadeddata = () => {
        video.currentTime = 0.5;
      };

      video.onseeked = () => {
        clearTimeout(timeout);
        try {
          let width = video.videoWidth || 640;
          let height = video.videoHeight || 480;

          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, width, height);

          canvas.toBlob((frameBlob) => {
            URL.revokeObjectURL(url);
            resolve(frameBlob);
          }, 'image/jpeg', quality);
        } catch (e) {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };

      video.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        resolve(null);
      };
    } catch (err) {
      resolve(null);
    }
  });
}

// Prepara arquivos de imagem otimizados para compartilhamento nativo no WhatsApp
async function prepareOptimizedShareFiles(chk, medias, includedItemIds = null) {
  const files = [];
  const cleanPlate = (chk.plateHorse || 'CAMINHAO').replace(/[^A-Z0-9]/g, '');
  
  let selectedMedias = (medias || []).filter(m => m.includeInShare !== false && m.blob);
  if (includedItemIds && includedItemIds.size > 0) {
    selectedMedias = selectedMedias.filter(m => includedItemIds.has(m.itemId));
  }

  for (let i = 0; i < selectedMedias.length; i++) {
    const m = selectedMedias[i];
    const parentItem = (chk.items || []).find(it => it.id === m.itemId);
    const itemTag = parentItem ? parentItem.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 15) : `Item_${i + 1}`;
    
    try {
      let finalBlob = null;
      let filename = '';

      if (m.type === 'photo') {
        finalBlob = await compressImageForShare(m.blob);
        filename = `VISTORIA_${cleanPlate}_${itemTag}_Foto_${i + 1}.jpg`;
      } else if (m.type === 'video') {
        finalBlob = await extractVideoFrameForShare(m.blob);
        filename = `VISTORIA_${cleanPlate}_${itemTag}_Video_Frame_${i + 1}.jpg`;
      }

      if (finalBlob) {
        const file = new File([finalBlob], filename, { type: 'image/jpeg', lastModified: Date.now() });
        files.push(file);
      }
    } catch (err) {
      console.warn('Erro ao otimizar mídia para compartilhamento:', err);
    }
  }

  return files;
}

// Compartilhamento individual de um único item do checklist direto no WhatsApp
async function shareIndividualItem(itemId) {
  if (!activeChecklist) return;
  
  collectFormIntoActiveChecklist();
  await window.TruckDB.saveChecklist(activeChecklist);

  const item = (activeChecklist.items || []).find(it => it.id === itemId);
  if (!item) {
    showToast('Item não encontrado.', 'warning');
    return;
  }

  showToast(`Preparando item "${item.title}" para envio...`, 'info');

  try {
    const allMedias = await window.TruckDB.getMediaByChecklist(activeChecklist.id);
    const itemMedias = (allMedias || []).filter(m => m.itemId === itemId);

    let statusText = '⚪ [NÃO VERIFICADO]';
    if (item.status === 'ok') statusText = '🟢 [CONFORME / OK]';
    else if (item.status === 'warn') statusText = '🟡 [ATENÇÃO / ALERTA]';
    else if (item.status === 'danger') statusText = '🔴 [DEFEITO / NÃO CONFORME]';

    let itemReport = `*TRUCK PRO - APONTAMENTO DE ITEM*\n`;
    itemReport += `Item: *${item.title}*\n`;
    itemReport += `Status: *${statusText}*\n`;
    if (item.note && item.note.trim()) {
      itemReport += `Observação: ${item.note.trim()}\n`;
    }
    itemReport += `--------------------------------------\n`;
    itemReport += `*VEÍCULO & MOTORISTA:*\n`;
    itemReport += `• Placa Cavalo: ${(activeChecklist.plateHorse || 'Não informada').toUpperCase()}\n`;
    if (activeChecklist.plateTrailer1) itemReport += `• Carreta 1: ${activeChecklist.plateTrailer1.toUpperCase()}\n`;
    if (activeChecklist.plateTrailer2) itemReport += `• Carreta 2: ${activeChecklist.plateTrailer2.toUpperCase()}\n`;
    itemReport += `• Motorista: ${activeChecklist.driverName || 'Não informado'}\n`;
    itemReport += `• Data/Hora: ${activeChecklist.inspectionDateTime || getFormattedCurrentDateTime()}\n`;
    if (activeChecklist.currentKm) itemReport += `• KM: ${activeChecklist.currentKm}\n`;
    if (activeChecklist.locationText) itemReport += `• Local: ${activeChecklist.locationText}\n`;
    if (activeChecklist.latitude && activeChecklist.longitude) {
      itemReport += `• GPS: https://www.google.com/maps?q=${activeChecklist.latitude},${activeChecklist.longitude}\n`;
    }
    
    if (itemMedias.length > 0) {
      itemReport += `--------------------------------------\n`;
      itemReport += `*MÍDIAS DO ITEM (${itemMedias.length}):*\n`;
      itemMedias.forEach((m, idx) => {
        const typeStr = m.type === 'photo' ? '📷 Foto' : '🎥 Vídeo';
        const resStr = m.resolved ? '✅ Resolvido' : '⚠️ Pendente';
        itemReport += `${idx + 1}. ${typeStr} (${resStr})\n`;
        if (m.notes && m.notes.trim()) {
          itemReport += `   ↳ ${m.notes.trim()}\n`;
        }
      });
    }

    itemReport += `--------------------------------------\n`;
    itemReport += `Enviado via Checklist Truck Pro`;

    // Prepara mídias do item de forma leve para o WhatsApp
    const shareFiles = [];
    const cleanPlate = (activeChecklist.plateHorse || 'CAMINHAO').replace(/[^A-Z0-9]/g, '');
    const cleanItemName = item.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 15);

    for (let i = 0; i < itemMedias.length; i++) {
      const m = itemMedias[i];
      if (!m.blob) continue;

      if (m.type === 'photo') {
        const compressedBlob = await compressImageForShare(m.blob);
        if (compressedBlob) {
          const file = new File([compressedBlob], `ITEM_${cleanPlate}_${cleanItemName}_Foto_${i + 1}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
          shareFiles.push(file);
        }
      } else if (m.type === 'video') {
        if (m.blob.size && m.blob.size <= 12 * 1024 * 1024 && (m.blob.type === 'video/mp4' || m.blob.type.includes('mp4'))) {
          const file = new File([m.blob], `ITEM_${cleanPlate}_${cleanItemName}_Video_${i + 1}.mp4`, { type: 'video/mp4', lastModified: Date.now() });
          shareFiles.push(file);
        } else {
          const frameBlob = await extractVideoFrameForShare(m.blob);
          if (frameBlob) {
            const file = new File([frameBlob], `ITEM_${cleanPlate}_${cleanItemName}_Video_Frame_${i + 1}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
            shareFiles.push(file);
          }
        }
      }
    }

    const shareTitle = `Apontamento - ${item.title} (${cleanPlate})`;

    // 1. Tenta compartilhamento nativo com mídias + texto
    if (shareFiles.length > 0 && navigator.canShare && navigator.canShare({ files: shareFiles })) {
      try {
        await navigator.share({
          title: shareTitle,
          text: itemReport,
          files: shareFiles
        });
        showToast('Item compartilhado com sucesso!', 'success');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('Falha no WebShare com arquivos do item:', err);
      }
    }

    // 2. Tenta compartilhamento nativo de texto
    if (navigator.canShare && navigator.canShare({ title: shareTitle, text: itemReport })) {
      try {
        await navigator.share({
          title: shareTitle,
          text: itemReport
        });
        showToast('Item compartilhado com sucesso!', 'success');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('Falha no WebShare de texto do item:', err);
      }
    }

    // 3. Fallback direto para WhatsApp (sem downloads na barra)
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const encodedText = encodeURIComponent(itemReport);
    const whatsappUrl = isMobile 
      ? `whatsapp://send?text=${encodedText}` 
      : `https://api.whatsapp.com/send?text=${encodedText}`;

    showToast('Abrindo WhatsApp com o item...', 'success');
    setTimeout(() => {
      window.location.href = whatsappUrl;
    }, 150);

  } catch (err) {
    console.error('Erro ao compartilhar item individual:', err);
    showToast('Erro ao preparar envio do item.', 'warning');
  }
}

async function openSharePreviewModal(checklistId) {
  const targetId = checklistId || (activeChecklist ? activeChecklist.id : null);
  if (!targetId) {
    showToast('Nenhum checklist disponível para compartilhar.', 'warning');
    return;
  }

  if (activeChecklist && activeChecklist.id === targetId) {
    collectFormIntoActiveChecklist();
    await window.TruckDB.saveChecklist(activeChecklist);
  }

  const [chkData, medias] = await Promise.all([
    window.TruckDB.getChecklist(targetId),
    window.TruckDB.getMediaByChecklist(targetId)
  ]);

  const chk = chkData || activeChecklist;
  if (!chk) {
    showToast('Vistoria não encontrada.', 'warning');
    return;
  }

  currentModalShareData.checklist = chk;
  currentModalShareData.medias = medias || [];
  
  // Por padrão, seleciona todos os itens para envio
  currentModalShareData.selectedItemIds = new Set((chk.items || []).map(i => i.id));
  currentModalShareData.filterMode = 'all';

  const plateEl = document.getElementById('modalSharePlate');
  if (plateEl) plateEl.textContent = (chk.plateHorse || 'SEM PLACA').toUpperCase();

  updateFilterChipsUi('all');
  renderModalShareItemList();
  renderModalShareMediaThumbnails();
  updateModalReportTextAndPreviews();

  const modal = document.getElementById('modalSharePreview');
  if (modal) modal.style.display = 'flex';
}

function closeSharePreviewModal() {
  const modal = document.getElementById('modalSharePreview');
  if (modal) modal.style.display = 'none';
}

function updateFilterChipsUi(mode) {
  ['chipFilterAll', 'chipFilterDefects', 'chipFilterCustom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  if (mode === 'all') {
    const el = document.getElementById('chipFilterAll');
    if (el) el.classList.add('active');
  } else if (mode === 'defects') {
    const el = document.getElementById('chipFilterDefects');
    if (el) el.classList.add('active');
  } else if (mode === 'custom') {
    const el = document.getElementById('chipFilterCustom');
    if (el) el.classList.add('active');
  }
}

function setModalItemFilter(mode) {
  const chk = currentModalShareData.checklist;
  if (!chk || !chk.items) return;

  currentModalShareData.filterMode = mode;
  updateFilterChipsUi(mode);

  if (mode === 'all') {
    currentModalShareData.selectedItemIds = new Set(chk.items.map(i => i.id));
  } else if (mode === 'defects') {
    const defectItems = chk.items.filter(i => i.status === 'danger' || i.status === 'warn');
    if (defectItems.length === 0) {
      showToast('Nenhum item com alerta/defeito encontrado. Mantendo todos.', 'info');
      currentModalShareData.selectedItemIds = new Set(chk.items.map(i => i.id));
      updateFilterChipsUi('all');
      currentModalShareData.filterMode = 'all';
    } else {
      currentModalShareData.selectedItemIds = new Set(defectItems.map(i => i.id));
    }
  }

  renderModalShareItemList();
  renderModalShareMediaThumbnails();
  updateModalReportTextAndPreviews();
}

function toggleModalChecklistItem(itemId) {
  if (currentModalShareData.selectedItemIds.has(itemId)) {
    if (currentModalShareData.selectedItemIds.size <= 1) {
      showToast('Pelo menos 1 item deve ser mantido no relatório.', 'warning');
      return;
    }
    currentModalShareData.selectedItemIds.delete(itemId);
  } else {
    currentModalShareData.selectedItemIds.add(itemId);
  }

  currentModalShareData.filterMode = 'custom';
  updateFilterChipsUi('custom');

  renderModalShareItemList();
  renderModalShareMediaThumbnails();
  updateModalReportTextAndPreviews();
}

function toggleAllModalItemSelection() {
  const chk = currentModalShareData.checklist;
  if (!chk || !chk.items || chk.items.length === 0) return;

  const allSelected = currentModalShareData.selectedItemIds.size === chk.items.length;
  if (allSelected) {
    currentModalShareData.selectedItemIds = new Set([chk.items[0].id]);
    currentModalShareData.filterMode = 'custom';
    updateFilterChipsUi('custom');
    showToast('Selecione os itens que deseja incluir no relatório.', 'info');
  } else {
    currentModalShareData.selectedItemIds = new Set(chk.items.map(i => i.id));
    currentModalShareData.filterMode = 'all';
    updateFilterChipsUi('all');
  }

  renderModalShareItemList();
  renderModalShareMediaThumbnails();
  updateModalReportTextAndPreviews();
}

function renderModalShareItemList() {
  const container = document.getElementById('modalShareItemList');
  const countBadge = document.getElementById('modalShareItemCount');
  if (!container || !currentModalShareData.checklist) return;

  const items = currentModalShareData.checklist.items || [];
  const selectedCount = currentModalShareData.selectedItemIds.size;
  if (countBadge) countBadge.textContent = `${selectedCount} de ${items.length}`;

  container.innerHTML = items.map(item => {
    const isChecked = currentModalShareData.selectedItemIds.has(item.id);
    let statusBadge = '<span class="status-badge" style="background: rgba(148,163,184,0.2); color: #cbd5e1;">⚪</span>';
    if (item.status === 'ok') statusBadge = '<span class="status-badge" style="background: rgba(34,197,94,0.2); color: #4ade80;">🟢 OK</span>';
    else if (item.status === 'warn') statusBadge = '<span class="status-badge" style="background: rgba(234,179,8,0.2); color: #facc15;">🟡 Alerta</span>';
    else if (item.status === 'danger') statusBadge = '<span class="status-badge" style="background: rgba(239,68,68,0.2); color: #f87171;">🔴 Defeito</span>';

    return `
      <label class="share-item-row ${isChecked ? 'selected' : ''}">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleModalChecklistItem('${item.id}')">
        <span class="share-item-row-title">${escapeHtml(item.title)}</span>
        ${statusBadge}
      </label>
    `;
  }).join('');
}

function updateModalReportTextAndPreviews() {
  const chk = currentModalShareData.checklist;
  if (!chk) return;

  currentModalShareData.text = formatChecklistReportText(
    chk, 
    currentModalShareData.medias, 
    currentModalShareData.selectedItemIds
  );

  const reportTextarea = document.getElementById('modalShareReportPreview');
  if (reportTextarea) reportTextarea.value = currentModalShareData.text;
}

function renderModalShareMediaThumbnails() {
  const container = document.getElementById('modalShareMediaThumbnails');
  const countBadge = document.getElementById('modalShareMediaCount');
  if (!container) return;

  const allMedias = currentModalShareData.medias || [];
  // Considera apenas mídias pertencentes aos itens selecionados no modal
  const relevantMedias = allMedias.filter(m => currentModalShareData.selectedItemIds.has(m.itemId));
  const selectedCount = relevantMedias.filter(m => m.includeInShare !== false).length;
  
  if (countBadge) countBadge.textContent = `${selectedCount} de ${relevantMedias.length} selecionadas`;

  if (relevantMedias.length === 0) {
    container.innerHTML = `<div style="grid-column: 1 / -1; padding: 12px; font-size: 0.8rem; color: var(--text-muted); text-align: center;">Nenhuma foto ou vídeo anexado nos itens selecionados.</div>`;
    return;
  }

  container.innerHTML = relevantMedias.map((m, idx) => {
    const isSelected = (m.includeInShare !== false);
    const blobUrl = URL.createObjectURL(m.blob);
    return `
      <div class="share-thumb-card ${isSelected ? 'selected' : 'unselected'}" onclick="toggleModalMediaItem('${m.id}')" title="Clique para incluir/remover">
        <span class="share-thumb-badge">${m.type === 'photo' ? '📷 FOTO' : '🎥 VÍDEO'}</span>
        <span class="share-thumb-check">✓</span>
        ${m.type === 'photo'
          ? `<img src="${blobUrl}" alt="Foto ${idx+1}">`
          : `<video src="${blobUrl}"></video>`
        }
      </div>
    `;
  }).join('');
}

async function toggleModalMediaItem(mediaId) {
  const item = (currentModalShareData.medias || []).find(m => m.id === mediaId);
  if (!item) return;

  const newStatus = (item.includeInShare === false);
  item.includeInShare = newStatus;
  await window.TruckDB.updateMediaRecord(mediaId, { includeInShare: newStatus });

  updateModalReportTextAndPreviews();
  renderModalShareMediaThumbnails();
}

async function toggleAllModalMediaSelection() {
  const allMedias = currentModalShareData.medias || [];
  const relevantMedias = allMedias.filter(m => currentModalShareData.selectedItemIds.has(m.itemId));
  if (relevantMedias.length === 0) return;

  const anySelected = relevantMedias.some(m => m.includeInShare !== false);
  const newSelection = !anySelected;

  for (const m of relevantMedias) {
    m.includeInShare = newSelection;
    await window.TruckDB.updateMediaRecord(m.id, { includeInShare: newSelection });
  }

  updateModalReportTextAndPreviews();
  renderModalShareMediaThumbnails();
}

async function copyReportTextDirectly() {
  const text = currentModalShareData.text || '';
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showToast('Relatório copiado para a área de transferência!', 'success');
    } else {
      showToast('Texto disponível na caixa de prévia.', 'info');
    }
  } catch (e) {
    showToast('Texto copiado!', 'success');
  }
}

// Compartilhamento direto das mídias com o checklist abaixo no WhatsApp
async function executeShareReportDocument() {
  const chk = currentModalShareData.checklist;
  if (!chk) return;

  const btn = document.getElementById('btnShareReportDoc');
  let originalBtnHtml = '';
  if (btn) {
    originalBtnHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span>⏳ Processando fotos e vídeos...</span>`;
  }

  showToast('Preparando fotos, vídeos e informações...', 'info');

  try {
    const text = currentModalShareData.text || formatChecklistReportText(chk, currentModalShareData.medias, currentModalShareData.selectedItemIds);
    const shareTitle = `Vistoria - Placa ${(chk.plateHorse || 'Truck Pro').toUpperCase()}`;

    // Copia o resumo em texto para o clipboard para garantia
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch (e) {}

    // Prepara as fotos e quadros de vídeos dos itens selecionados
    const shareFiles = await prepareOptimizedShareFiles(chk, currentModalShareData.medias, currentModalShareData.selectedItemIds);

    // 1. Tenta compartilhar fotos/vídeos com o texto do checklist via WebShare nativo
    if (shareFiles.length > 0 && navigator.canShare && navigator.canShare({ files: shareFiles })) {
      try {
        await navigator.share({
          title: shareTitle,
          text: text,
          files: shareFiles
        });
        showToast('Fotos, vídeos e checklist compartilhados com sucesso!', 'success');
        closeSharePreviewModal();
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // Cancelado pelo usuário
        console.warn('Falha no WebShare com arquivos de imagem:', err);
      }
    }

    // 2. Se não houver mídias ou WebShare com arquivos falhar, tenta compartilhar só o texto
    if (navigator.canShare && navigator.canShare({ title: shareTitle, text: text })) {
      try {
        await navigator.share({
          title: shareTitle,
          text: text
        });
        showToast('Checklist compartilhado com sucesso!', 'success');
        closeSharePreviewModal();
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('Falha no WebShare de texto:', err);
      }
    }

    // 3. Fallback: Abre o WhatsApp diretamente com o texto do relatório (sem downloads indesejados)
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const encodedText = encodeURIComponent(text);
    const whatsappUrl = isMobile 
      ? `whatsapp://send?text=${encodedText}` 
      : `https://api.whatsapp.com/send?text=${encodedText}`;

    showToast('Abrindo WhatsApp com o relatório...', 'success');
    closeSharePreviewModal();
    setTimeout(() => {
      window.location.href = whatsappUrl;
    }, 150);

  } catch (err) {
    console.error('Erro ao compartilhar:', err);
    showToast('Abrindo WhatsApp...', 'info');
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const text = currentModalShareData.text || '';
    const whatsappUrl = isMobile 
      ? `whatsapp://send?text=${encodeURIComponent(text)}` 
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.location.href = whatsappUrl;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalBtnHtml;
    }
  }
}

// Mantém compatibilidade com chamadas anteriores
async function shareReportViaWhatsApp(checklistId) {
  await openSharePreviewModal(checklistId);
}

// ==========================================
// BADGES & NOTIFICAÇÕES
// ==========================================
function updateBadges() {
  if (!activeChecklist || !activeChecklist.items) return;
  const defectCount = activeChecklist.items.filter(i => i.status === 'danger' || i.status === 'warn').length;
  const badge = document.getElementById('tab2Badge');
  if (defectCount > 0) {
    badge.textContent = defectCount;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function triggerAutoSave() {
  clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(async () => {
    if (activeChecklist) {
      collectFormIntoActiveChecklist();
      await window.TruckDB.saveChecklist(activeChecklist);
    }
  }, 400);
}

// ==========================================
// EVENT LISTENERS GERAIS
// ==========================================
function setupEventListeners() {
  // Temas
  document.getElementById('btnOpenThemes').addEventListener('click', openThemesModal);

  // Placas
  attachPlateMask(document.getElementById('plateHorse'));
  attachPlateMask(document.getElementById('plateTrailer1'));
  attachPlateMask(document.getElementById('plateTrailer2'));

  // Veículo
  document.getElementById('vehicleType').addEventListener('change', () => {
    updateTrailer2Visibility();
    triggerAutoSave();
  });

  // Inputs Aba 1
  ['driverName', 'currentKm', 'inspectionDateTime', 'locationText'].forEach(id => {
    document.getElementById(id).addEventListener('input', triggerAutoSave);
  });

  document.getElementById('btnRefreshTime').addEventListener('click', refreshDateTimeInput);
  document.getElementById('btnGetLocation').addEventListener('click', captureCurrentLocation);

  // Ações de Salvar e Concluir
  document.getElementById('btnSaveChecklistDraft').addEventListener('click', saveCurrentChecklistDraft);
  document.getElementById('btnConcludeChecklist').addEventListener('click', concludeCurrentChecklist);
  document.getElementById('btnShareWhatsAppQuick').addEventListener('click', () => {
    shareReportViaWhatsApp(activeChecklist.id);
  });

  // Nova Vistoria
  document.getElementById('btnNewChecklist').addEventListener('click', async () => {
    if (confirm('Deseja iniciar uma Nova Vistoria? A vistoria atual será guardada em suas Vistorias Salvas.')) {
      collectFormIntoActiveChecklist();
      await window.TruckDB.saveChecklist(activeChecklist);

      activeChecklist = createEmptyChecklist();
      await window.TruckDB.saveChecklist(activeChecklist);
      localStorage.setItem('truck_active_checklist_id', activeChecklist.id);
      window.activeChecklist = activeChecklist;

      populateFormFromActiveChecklist();
      await renderChecklistItems();
      await refreshHistoryList();
      switchTab(1);
      showToast('Nova vistoria iniciada!', 'success');
    }
  });

  // Inputs de Foto/Vídeo Dinâmicos
  document.getElementById('activeCameraPhotoInput').addEventListener('change', (e) => handleIncomingFiles(e.target.files, 'photo'));
  document.getElementById('activeGalleryPhotoInput').addEventListener('change', (e) => handleIncomingFiles(e.target.files, 'photo'));
  document.getElementById('activeCameraVideoInput').addEventListener('change', (e) => handleIncomingFiles(e.target.files, 'video'));
  document.getElementById('activeGalleryVideoInput').addEventListener('change', (e) => handleIncomingFiles(e.target.files, 'video'));

  // Modal Item Customizado
  const modalCustomItem = document.getElementById('modalCustomItem');
  document.getElementById('btnOpenAddCustomItem').addEventListener('click', () => {
    document.getElementById('customItemTitle').value = '';
    document.getElementById('customItemDesc').value = '';
    modalCustomItem.style.display = 'flex';
  });
  document.getElementById('btnCancelCustomItem').addEventListener('click', () => {
    modalCustomItem.style.display = 'none';
  });
  document.getElementById('btnConfirmCustomItem').addEventListener('click', () => {
    const title = document.getElementById('customItemTitle').value.trim();
    const desc = document.getElementById('customItemDesc').value.trim();
    if (!title) {
      showToast('Por favor, informe o nome do item.', 'warning');
      return;
    }

    const newItem = {
      id: `custom_${Date.now()}`,
      title: title,
      desc: desc,
      status: 'none',
      note: '',
      isCustom: true
    };

    activeChecklist.items.push(newItem);
    renderChecklistItems();
    triggerAutoSave();
    modalCustomItem.style.display = 'none';
    showToast('Novo item adicionado à vistoria!', 'success');
  });
}

// ==========================================
// TOAST NOTIFICATIONS & HELPERS
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const iconSvg = type === 'success'
    ? '<svg class="ui-icon" style="color: #34d399;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
    : type === 'warning'
    ? '<svg class="ui-icon" style="color: #fbbf24;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    : '<svg class="ui-icon" style="color: #60a5fa;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================
// SALVAMENTO FORÇADO E LIFECYCLE DO NAVEGADOR
// ==========================================
async function forceSaveActiveChecklist() {
  if (!activeChecklist) return null;
  collectFormIntoActiveChecklist();
  if (window.TruckDB) {
    const saved = await window.TruckDB.saveChecklist(activeChecklist);
    return saved;
  }
  return activeChecklist;
}

// Salva imediatamente quando o usuário fecha o navegador, muda de aba ou atualiza o app
window.addEventListener('beforeunload', () => {
  if (activeChecklist) {
    collectFormIntoActiveChecklist();
    try {
      localStorage.setItem('truck_emergency_active_checklist', JSON.stringify(activeChecklist));
      localStorage.setItem(`truck_chk_snapshot_${activeChecklist.id}`, JSON.stringify(activeChecklist));
      localStorage.setItem('truck_active_checklist_id', activeChecklist.id);
    } catch (e) {}
    if (window.TruckDB) {
      window.TruckDB.saveChecklist(activeChecklist);
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && activeChecklist && window.TruckDB) {
    collectFormIntoActiveChecklist();
    try {
      localStorage.setItem('truck_emergency_active_checklist', JSON.stringify(activeChecklist));
      localStorage.setItem(`truck_chk_snapshot_${activeChecklist.id}`, JSON.stringify(activeChecklist));
    } catch (e) {}
    window.TruckDB.saveChecklist(activeChecklist);
  }
});

window.addEventListener('pagehide', () => {
  if (activeChecklist && window.TruckDB) {
    collectFormIntoActiveChecklist();
    try {
      localStorage.setItem('truck_emergency_active_checklist', JSON.stringify(activeChecklist));
    } catch (e) {}
    window.TruckDB.saveChecklist(activeChecklist);
  }
});

// Funções expostas globalmente para o módulo de autenticação, update, compartilhamento e histórico
window.initActiveChecklist = initActiveChecklist;
window.refreshHistoryList = refreshHistoryList;
window.collectFormIntoActiveChecklist = collectFormIntoActiveChecklist;
window.forceSaveActiveChecklist = forceSaveActiveChecklist;
window.openSharePreviewModal = openSharePreviewModal;
window.closeSharePreviewModal = closeSharePreviewModal;
window.toggleModalMediaItem = toggleModalMediaItem;
window.toggleAllModalMediaSelection = toggleAllModalMediaSelection;
window.copyReportTextDirectly = copyReportTextDirectly;
window.executeShareReportDocument = executeShareReportDocument;
window.executeShareDirectPhotos = executeShareReportDocument;
window.executeShareTextOnly = executeShareReportDocument;
window.executeShareNativeWithFiles = executeShareReportDocument;
window.executeShareOtherApps = executeShareReportDocument;
window.downloadSelectedShareMedias = executeShareReportDocument;
window.shareReportViaWhatsApp = shareReportViaWhatsApp;
window.shareIndividualItem = shareIndividualItem;
window.setModalItemFilter = setModalItemFilter;
window.toggleModalChecklistItem = toggleModalChecklistItem;
window.toggleAllModalItemSelection = toggleAllModalItemSelection;

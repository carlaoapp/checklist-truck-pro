/**
 * UPDATE.JS - CHECKLIST TRUCK PRO
 * Versão do aplicativo + aviso de atualização disponível.
 * Adaptado do fluxo do app Tudo em Dia (aviso "Atualização Disponível" com botões
 * "Atualizar Agora" / "Mais Tarde"), usando um arquivo estático version.json
 * (o Checklist não possui servidor próprio, roda 100% no aparelho).
 *
 * IMPORTANTE: atualizar NÃO apaga vistorias, fotos, vídeos nem contas.
 * Esses dados ficam no IndexedDB/localStorage, que não são tocados aqui.
 * Apenas o cache dos arquivos do app (Service Worker) é renovado.
 *
 * PARA PUBLICAR UMA NOVA VERSÃO: altere APP_VERSION abaixo, o "version" em
 * version.json e o CACHE_NAME em sw.js para o mesmo número.
 */

const APP_VERSION = '1.7.1';

const UPDATE_CHECK_INTERVAL_MS = 60000;
let updatePromptShownFor = null;

// ==========================================
// EXIBIÇÃO DA VERSÃO ATUAL NA TELA
// ==========================================
function renderAppVersionTags() {
  document.querySelectorAll('.app-version-tag').forEach((el) => {
    el.textContent = `v${APP_VERSION}`;
  });
}

// ==========================================
// VERIFICAÇÃO DE NOVA VERSÃO
// ==========================================
async function fetchLatestVersion() {
  const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data && data.version ? String(data.version) : null;
}

/**
 * @param {boolean} manual - true quando o motorista tocou em "Verificar atualização"
 */
async function checkForUpdates(manual = false) {
  if (!navigator.onLine) {
    if (manual) showToast('Sem internet no momento. Conecte-se para verificar atualizações.', 'warning');
    return;
  }

  try {
    const latest = await fetchLatestVersion();
    if (!latest) return;

    if (latest !== APP_VERSION) {
      if (!manual && sessionStorage.getItem(`update_postponed_${latest}`) === 'true') return;
      showUpdatePrompt(latest);
    } else {
      const box = document.getElementById('appUpdatePromptBox');
      if (box) box.remove();
      if (manual) showToast(`Você já está na versão mais recente (v${APP_VERSION}).`, 'success');
    }
  } catch (e) {
    if (manual) showToast('Não foi possível verificar agora. Tente novamente.', 'warning');
  }
}

// ==========================================
// AVISO "ATUALIZAÇÃO DISPONÍVEL"
// ==========================================
function showUpdatePrompt(newVersion) {
  if (document.getElementById('appUpdatePromptBox')) return;
  updatePromptShownFor = newVersion;

  const box = document.createElement('div');
  box.id = 'appUpdatePromptBox';
  box.className = 'app-update-prompt';
  box.setAttribute('role', 'alertdialog');
  box.innerHTML = `
    <div class="app-update-title">
      <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>
      <span>Atualização Disponível</span>
    </div>
    <div class="app-update-text">
      Nova versão <strong>v${escapeHtml(newVersion)}</strong> pronta para uso.<br>
      Versão instalada: v${escapeHtml(APP_VERSION)}. Suas vistorias e fotos serão mantidas.
    </div>
    <div class="app-update-buttons">
      <button id="btnUpdateNow" type="button" class="app-update-btn-now">
        <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        <span>Atualizar Agora</span>
      </button>
      <button id="btnUpdateLater" type="button" class="app-update-btn-later">Mais Tarde</button>
    </div>
  `;
  document.body.appendChild(box);

  document.getElementById('btnUpdateNow').addEventListener('click', () => applyUpdate(newVersion, box));
  document.getElementById('btnUpdateLater').addEventListener('click', () => {
    sessionStorage.setItem(`update_postponed_${newVersion}`, 'true');
    box.classList.add('closing');
    setTimeout(() => box.remove(), 350);
  });
}

// ==========================================
// APLICAR ATUALIZAÇÃO (SEM PERDER DADOS)
// ==========================================
async function applyUpdate(newVersion, box) {
  box.innerHTML = `
    <div class="app-update-title">
      <svg class="ui-icon app-update-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>
      <span>Instalando atualização...</span>
    </div>
  `;

  try {
    // 1) Garante que a vistoria em edição esteja 100% gravada no banco antes de recarregar
    if (window.forceSaveActiveChecklist) {
      await window.forceSaveActiveChecklist();
    } else if (typeof collectFormIntoActiveChecklist === 'function' && window.activeChecklist && window.TruckDB) {
      collectFormIntoActiveChecklist();
      await window.TruckDB.saveChecklist(window.activeChecklist);
    }

    // 2) Confirma que o servidor responde antes de apagar o cache (evita ficar sem app)
    const probe = await fetch(`index.html?t=${Date.now()}`, { cache: 'no-store' });
    if (!probe.ok) throw new Error('Servidor indisponível');

    // 3) Renova somente o cache dos arquivos do app (IndexedDB e localStorage permanecem 100% intactos)
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) await reg.unregister();
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      for (const key of keys) await caches.delete(key);
    }

    setTimeout(() => {
      window.location.replace(`${window.location.origin}${window.location.pathname}?v=${Date.now()}`);
    }, 400);
  } catch (e) {
    console.warn('Falha ao atualizar:', e);
    box.remove();
    showToast('Não foi possível atualizar agora. Verifique a internet e tente novamente.', 'warning');
  }
}

// ==========================================
// BAIXAR / INSTALAR APLICATIVO (PWA INSTALL PROMPT)
// ==========================================
let deferredInstallPrompt = null;

function isAppInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function showInstallPrompt() {
  if (isAppInstalled()) return;
  if (sessionStorage.getItem('pwa_install_dismissed') === 'true') return;
  if (document.getElementById('pwaInstallPromptBox')) return;

  const box = document.createElement('div');
  box.id = 'pwaInstallPromptBox';
  box.className = 'app-install-prompt';
  box.setAttribute('role', 'dialog');
  box.innerHTML = `
    <div class="app-install-card">
      <div class="app-install-header">
        <img src="icons/icon-192.png" alt="Logo Truck Pro" class="app-install-logo">
        <div class="app-install-info">
          <div class="app-install-title">Baixar Checklist Truck Pro?</div>
          <div class="app-install-subtitle">Acesso rápido e funcionamento 100% offline</div>
        </div>
      </div>
      <div class="app-install-desc">
        Deseja instalar o aplicativo no seu aparelho? Ele fica salvo na tela inicial e abre instantaneamente mesmo sem sinal de internet na estrada.
      </div>
      <div class="app-install-buttons">
        <button id="btnPwaInstallNow" type="button" class="btn-pwa-install-now">
          <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Baixar / Instalar App</span>
        </button>
        <button id="btnPwaInstallDismiss" type="button" class="btn-pwa-install-later">Agora Não</button>
      </div>
    </div>
  `;

  document.body.appendChild(box);

  document.getElementById('btnPwaInstallNow').addEventListener('click', () => triggerAppInstall(box));
  document.getElementById('btnPwaInstallDismiss').addEventListener('click', () => {
    sessionStorage.setItem('pwa_install_dismissed', 'true');
    box.classList.add('closing');
    setTimeout(() => box.remove(), 350);
  });
}

async function triggerAppInstall(boxEl = null) {
  if (deferredInstallPrompt) {
    try {
      deferredInstallPrompt.prompt();
      const choiceResult = await deferredInstallPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        showToast('Instalando aplicativo na sua tela inicial...', 'success');
        if (boxEl) boxEl.remove();
        const headerBtn = document.getElementById('btnInstallApp');
        if (headerBtn) headerBtn.style.display = 'none';
      } else {
        showToast('Instalação adiada.', 'info');
      }
      deferredInstallPrompt = null;
    } catch (e) {
      console.warn('Erro ao acionar prompt de instalação:', e);
    }
  } else if (isIOS()) {
    alert("Para baixar no iPhone/iPad:\n1. Toque no botão de Compartilhar (ícone com seta para cima 📤) no Safari;\n2. Role para baixo e selecione 'Adicionar à Tela de Início' 📲.");
  } else {
    showToast("Para instalar: toque no menu do navegador (3 pontinhos) e escolha 'Instalar aplicativo' ou 'Adicionar à tela inicial'.", 'info');
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;

  const headerBtn = document.getElementById('btnInstallApp');
  if (headerBtn && !isAppInstalled()) {
    headerBtn.style.display = 'inline-flex';
  }

  // Exibe a caixinha perguntando se o usuário quer ou não baixar o app após 1.5s
  setTimeout(showInstallPrompt, 1500);
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const box = document.getElementById('pwaInstallPromptBox');
  if (box) box.remove();
  const headerBtn = document.getElementById('btnInstallApp');
  if (headerBtn) headerBtn.style.display = 'none';
  showToast('Aplicativo Checklist Truck Pro instalado com sucesso!', 'success');
});

// ==========================================
// INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  renderAppVersionTags();

  // Se for iOS e não estiver instalado, disponibiliza o botão no topo
  if (isIOS() && !isAppInstalled()) {
    const headerBtn = document.getElementById('btnInstallApp');
    if (headerBtn) headerBtn.style.display = 'inline-flex';
  }

  setTimeout(() => checkForUpdates(false), 2500);
  setInterval(() => checkForUpdates(false), UPDATE_CHECK_INTERVAL_MS);
  window.addEventListener('online', () => checkForUpdates(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdates(false);
  });
});

window.APP_VERSION = APP_VERSION;
window.checkForUpdates = checkForUpdates;
window.showUpdatePrompt = showUpdatePrompt;
window.triggerAppInstall = triggerAppInstall;
window.showInstallPrompt = showInstallPrompt;

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

const APP_VERSION = '1.4.0';

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
    // 1) Garante que a vistoria em edição esteja gravada no aparelho antes de recarregar
    if (typeof collectFormIntoActiveChecklist === 'function' && window.activeChecklist && window.TruckDB) {
      collectFormIntoActiveChecklist();
      await window.TruckDB.saveChecklist(window.activeChecklist);
    }

    // 2) Confirma que o servidor responde antes de apagar o cache (evita ficar sem app)
    const probe = await fetch(`index.html?t=${Date.now()}`, { cache: 'no-store' });
    if (!probe.ok) throw new Error('Servidor indisponível');

    // 3) Renova somente o cache dos arquivos do app (IndexedDB e localStorage permanecem)
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
// INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  renderAppVersionTags();

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

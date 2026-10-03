/**
 * AUTH.JS - CHECKLIST TRUCK PRO
 * Sistema de Autenticação e Cadastro com Isolamento Seguro de Vistorias por Motorista
 * Adaptado da funcionalidade comprovada do Tudo em Dia para padrão de frotas rodoviárias.
 */

const AUTH_TOKEN_KEY = 'truck_pro_token';
const AUTH_USER_KEY = 'truck_pro_user';
let currentAuthMode = 'login'; // 'login' | 'register'

// ==========================================
// CRIPTOGRAFIA / HASHING SEGURO (SHA-256 NATIVO)
// ==========================================
async function hashPassword(plainText) {
  const enc = new TextEncoder();
  const data = enc.encode(plainText + '_truck_pro_fleet_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==========================================
// GESTÃO DE SESSÃO DO MOTORISTA
// ==========================================
function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY);
}

function getAuthUser() {
  const str = localStorage.getItem(AUTH_USER_KEY) || sessionStorage.getItem(AUTH_USER_KEY);
  if (!str) return null;
  try { return JSON.parse(str); } catch (e) { return null; }
}

function saveAuthSession(token, user, remember = true) {
  const storage = remember ? localStorage : sessionStorage;
  if (remember) {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  }
  storage.setItem(AUTH_TOKEN_KEY, token);
  storage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function logout() {
  if (confirm('Deseja realmente sair da sua conta de motorista?')) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem('truck_active_checklist_id');
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
    window.location.reload();
  }
}

// ==========================================
// INICIALIZAÇÃO DA AUTENTICAÇÃO
// ==========================================
async function initAuth() {
  // Inicializa conta padrão de demonstração se banco estiver vazio
  await seedDefaultAccountIfEmpty();

  const user = getAuthUser();
  const authContainer = document.getElementById('authContainer');

  if (!user) {
    // Exibe tela de login/cadastro
    if (authContainer) {
      authContainer.style.display = 'flex';
      setAuthMode('login');
    }
    // Fecha tela de splash mais rapidamente se precisar fazer login
    dismissSplash();
    return false;
  }

  // Usuário autenticado
  if (authContainer) {
    authContainer.style.display = 'none';
  }

  updateUserInterface(user);
  return true;
}

async function seedDefaultAccountIfEmpty() {
  try {
    const existing = await window.TruckDB.getAllUsers();
    if (existing.length === 0) {
      const defaultHash = await hashPassword('123456');
      await window.TruckDB.createUser({
        id: 'usr_carlos_silva',
        name: 'Carlos Silva',
        email: 'carlos@truckpro.com',
        passwordHash: defaultHash,
        createdAt: new Date().toISOString()
      });
      console.log('Conta demonstrativa inicial configurada.');
    }
  } catch (e) {
    console.warn('Verificação de seed:', e);
  }
}

function updateUserInterface(user) {
  const userDisplay = document.getElementById('currentUserDisplay');
  const userEmailEl = document.getElementById('currentUserEmail') || document.getElementById('currentUserName');
  const driverInput = document.getElementById('driverName');

  if (userDisplay && userEmailEl) {
    const emailToDisplay = user.email || user.name || 'motorista';
    userEmailEl.textContent = emailToDisplay;
    userEmailEl.title = emailToDisplay;
    userDisplay.style.display = 'inline-flex';
  }

  // Preenche o campo "Nome do Motorista" automaticamente no formulário
  if (driverInput && !driverInput.value.trim() && user.name) {
    driverInput.value = user.name;
    if (window.activeChecklist) {
      window.activeChecklist.driverName = user.name;
    }
  }
}

// ==========================================
// CONTROLE DE ABAS (ENTRAR / CRIAR CONTA)
// ==========================================
function setAuthMode(mode) {
  currentAuthMode = mode;
  const tabLogin = document.getElementById('tabAuthLogin');
  const tabRegister = document.getElementById('tabAuthRegister');
  const nameGroup = document.getElementById('authNameGroup');
  const confirmPwdGroup = document.getElementById('authConfirmPwdGroup');
  const submitBtn = document.getElementById('authSubmitBtn');
  const titleEl = document.getElementById('authModalTitle');
  const subtitleEl = document.getElementById('authModalSubtitle');
  const toggleLink = document.getElementById('authToggleModeLink');
  const errorBox = document.getElementById('authErrorBox');

  if (errorBox) {
    errorBox.style.display = 'none';
    errorBox.textContent = '';
  }

  if (mode === 'login') {
    if (tabLogin) {
      tabLogin.classList.add('active');
    }
    if (tabRegister) {
      tabRegister.classList.remove('active');
    }
    if (nameGroup) nameGroup.style.display = 'none';
    if (confirmPwdGroup) confirmPwdGroup.style.display = 'none';
    if (titleEl) titleEl.textContent = 'CHECKLIST TRUCK PRO';
    if (subtitleEl) subtitleEl.textContent = 'Acesso do Motorista & Gestão de Frotas';
    if (submitBtn) submitBtn.innerHTML = `<span>Entrar no Sistema</span>`;
    if (toggleLink) toggleLink.textContent = 'Não possui conta? Cadastre-se agora.';
  } else {
    if (tabRegister) {
      tabRegister.classList.add('active');
    }
    if (tabLogin) {
      tabLogin.classList.remove('active');
    }
    if (nameGroup) nameGroup.style.display = 'block';
    if (confirmPwdGroup) confirmPwdGroup.style.display = 'block';
    if (titleEl) titleEl.textContent = 'Cadastrar Novo Motorista';
    if (subtitleEl) subtitleEl.textContent = 'Crie seu acesso para manter suas vistorias salvas individualmente';
    if (submitBtn) submitBtn.innerHTML = `<span>Criar Minha Conta</span>`;
    if (toggleLink) toggleLink.textContent = 'Já possui cadastro? Fazer login.';
  }
}

// ==========================================
// SUBMIT DE LOGIN / CADASTRO
// ==========================================
async function handleAuthSubmit() {
  const emailInput = document.getElementById('authEmail');
  const pwdInput = document.getElementById('authPassword');
  const nameInput = document.getElementById('authName');
  const confirmPwdInput = document.getElementById('authConfirmPassword');
  const rememberCheckbox = document.getElementById('authRemember');
  const errorBox = document.getElementById('authErrorBox');

  const email = (emailInput ? emailInput.value : '').trim();
  const password = pwdInput ? pwdInput.value : '';
  const remember = rememberCheckbox ? rememberCheckbox.checked : true;

  const showError = (msg) => {
    if (errorBox) {
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
    } else {
      alert(msg);
    }
  };

  if (errorBox) errorBox.style.display = 'none';

  if (!email) {
    showError('Por favor, informe seu e-mail ou usuário.');
    return;
  }

  if (!password || password.length < 4) {
    showError('A senha deve conter no mínimo 4 caracteres.');
    return;
  }

  const submitBtn = document.getElementById('authSubmitBtn');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const pwdHash = await hashPassword(password);

    if (currentAuthMode === 'register') {
      const name = nameInput ? nameInput.value.trim() : '';
      const confirmPwd = confirmPwdInput ? confirmPwdInput.value : '';

      if (!name) {
        showError('Por favor, informe o seu Nome Completo.');
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      if (password !== confirmPwd) {
        showError('As senhas digitadas não coincidem.');
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      // Verifica se usuário já existe
      const existingUser = await window.TruckDB.getUserByEmail(email);
      if (existingUser) {
        showError('Já existe um motorista cadastrado com este e-mail. Faça login ou use outro e-mail.');
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      const newUser = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: name,
        email: email.toLowerCase(),
        passwordHash: pwdHash,
        createdAt: new Date().toISOString()
      };

      await window.TruckDB.createUser(newUser);
      const token = `truck_token_${Date.now()}`;
      saveAuthSession(token, newUser, remember);

      updateUserInterface(newUser);
      document.getElementById('authContainer').style.display = 'none';

      // Atualiza o checklist ativo com o novo motorista
      if (typeof window.initActiveChecklist === 'function') {
        await window.initActiveChecklist();
      }
      if (typeof window.refreshHistoryList === 'function') {
        await window.refreshHistoryList();
      }

      showToast(`Conta criada com sucesso! Bem-vindo, ${newUser.name}!`, 'success');
    } else {
      // Modo LOGIN
      const user = await window.TruckDB.getUserByEmail(email);
      if (!user || user.passwordHash !== pwdHash) {
        showError('E-mail ou senha incorretos. Verifique seus dados.');
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      const token = `truck_token_${Date.now()}`;
      saveAuthSession(token, user, remember);

      updateUserInterface(user);
      document.getElementById('authContainer').style.display = 'none';

      // Carrega imediatamente os dados do motorista autenticado
      if (typeof window.initActiveChecklist === 'function') {
        await window.initActiveChecklist();
      }
      if (typeof window.refreshHistoryList === 'function') {
        await window.refreshHistoryList();
      }

      showToast(`Login realizado com sucesso! Bem-vindo, ${user.name}!`, 'success');
    }
  } catch (err) {
    console.error('Erro na autenticação:', err);
    showError('Ocorreu um erro ao processar. Tente novamente.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ==========================================
// VISUALIZADOR DE SENHA (OLHO)
// ==========================================
function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';

  if (btnEl) {
    btnEl.innerHTML = isPassword
      ? `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
      : `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
  }
}

// Expõe no escopo global
window.TruckAuth = {
  initAuth,
  getAuthUser,
  getAuthToken,
  saveAuthSession,
  logout,
  setAuthMode,
  handleAuthSubmit,
  togglePasswordVisibility
};

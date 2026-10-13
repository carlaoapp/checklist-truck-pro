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
  const clean = String(plainText || '').trim();
  const enc = new TextEncoder();
  const data = enc.encode(clean + '_truck_pro_fleet_salt_2026');
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {}
  }
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = ((hash << 5) - hash) + clean.charCodeAt(i);
    hash |= 0;
  }
  return 'fb_' + Math.abs(hash).toString(16);
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
  // Inicializa e sincroniza contas padrão (Mariano Santo e Carlos Silva)
  await seedDefaultAccountIfEmpty();

  const user = getAuthUser();
  const authContainer = document.getElementById('authContainer');

  if (!user) {
    // Exibe tela de login/cadastro
    if (authContainer) {
      authContainer.style.display = 'flex';
      setAuthMode('login');

      // Preenche o último e-mail lembrado se houver
      const lastEmail = localStorage.getItem('truck_last_email') || 'marianosanto33@gmail.com';
      const emailInput = document.getElementById('authEmail');
      if (lastEmail && emailInput && !emailInput.value) {
        emailInput.value = lastEmail;
      }
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
    const marianoHash = await hashPassword('Ca36792679');
    const existingMariano = await window.TruckDB.getUserByEmail('marianosanto33@gmail.com');
    if (!existingMariano || existingMariano.passwordHash !== marianoHash) {
      await window.TruckDB.createUser({
        id: (existingMariano && existingMariano.id) || 'usr_mariano_santo',
        name: (existingMariano && existingMariano.name) || 'Mariano Santo',
        email: 'marianosanto33@gmail.com',
        passwordHash: marianoHash,
        createdAt: (existingMariano && existingMariano.createdAt) || new Date().toISOString()
      });
      console.log('Conta do motorista Mariano Santo sincronizada com sucesso.');
    }

    const carlosHash = await hashPassword('123456');
    const existingCarlos = await window.TruckDB.getUserByEmail('carlos@truckpro.com');
    if (!existingCarlos) {
      await window.TruckDB.createUser({
        id: 'usr_carlos_silva',
        name: 'Carlos Silva',
        email: 'carlos@truckpro.com',
        passwordHash: carlosHash,
        createdAt: new Date().toISOString()
      });
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

  const email = (emailInput ? emailInput.value : '').trim().toLowerCase();
  const password = (pwdInput ? pwdInput.value : '').trim();
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
      const confirmPwd = (confirmPwdInput ? confirmPwdInput.value : '').trim();

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
        // Atualiza a senha da conta com a nova senha digitada
        existingUser.name = name;
        existingUser.passwordHash = pwdHash;
        await window.TruckDB.updateUser(existingUser);

        const token = `truck_token_${Date.now()}`;
        saveAuthSession(token, existingUser, remember);
        localStorage.setItem('truck_last_email', email);

        updateUserInterface(existingUser);
        document.getElementById('authContainer').style.display = 'none';

        try {
          if (typeof window.initActiveChecklist === 'function') await window.initActiveChecklist();
          if (typeof window.refreshHistoryList === 'function') await window.refreshHistoryList();
        } catch (e) {}

        showToast(`Conta atualizada com sucesso! Bem-vindo, ${existingUser.name}!`, 'success');
        return;
      }

      const newUser = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: name,
        email: email,
        passwordHash: pwdHash,
        createdAt: new Date().toISOString()
      };

      await window.TruckDB.createUser(newUser);
      const token = `truck_token_${Date.now()}`;
      saveAuthSession(token, newUser, remember);
      localStorage.setItem('truck_last_email', email);

      updateUserInterface(newUser);
      document.getElementById('authContainer').style.display = 'none';

      try {
        if (typeof window.initActiveChecklist === 'function') await window.initActiveChecklist();
        if (typeof window.refreshHistoryList === 'function') await window.refreshHistoryList();
      } catch (e) {}

      showToast(`Conta criada com sucesso! Bem-vindo, ${newUser.name}!`, 'success');
    } else {
      // Modo LOGIN
      let user = await window.TruckDB.getUserByEmail(email);

      // Se a conta não existe, auto-cria para dar acesso imediato ao motorista
      if (!user) {
        const autoName = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const newUser = {
          id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: autoName,
          email: email,
          passwordHash: pwdHash,
          createdAt: new Date().toISOString()
        };
        await window.TruckDB.createUser(newUser);
        user = newUser;
      } else if (user.passwordHash !== pwdHash) {
        // Se a senha informada não confere
        showError('Senha incorreta para este e-mail. Toque em "Esqueci a senha" para redefinir.');
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      const token = `truck_token_${Date.now()}`;
      saveAuthSession(token, user, remember);
      localStorage.setItem('truck_last_email', email);

      updateUserInterface(user);
      document.getElementById('authContainer').style.display = 'none';

      try {
        if (typeof window.initActiveChecklist === 'function') await window.initActiveChecklist();
        if (typeof window.refreshHistoryList === 'function') await window.refreshHistoryList();
      } catch (e) {}

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
// RECUPERAÇÃO DE SENHA (ESQUECI A SENHA)
// ==========================================
let currentResetCode = null;

function abrirModalEsqueciSenha() {
  const modal = document.getElementById('modalEsqueciSenha');
  const authEmail = document.getElementById('authEmail');
  const esqueciEmail = document.getElementById('esqueciEmail');
  const alerta = document.getElementById('esqueciAlertaMsg');

  if (alerta) alerta.style.display = 'none';
  if (authEmail && esqueciEmail && authEmail.value) {
    esqueciEmail.value = authEmail.value.trim();
  }
  voltarPasso1Esqueci();
  if (modal) modal.style.display = 'flex';
}

function fecharModalEsqueciSenha() {
  const modal = document.getElementById('modalEsqueciSenha');
  if (modal) modal.style.display = 'none';
}

function voltarPasso1Esqueci() {
  const passo1 = document.getElementById('esqueciPasso1');
  const passo2 = document.getElementById('esqueciPasso2');
  const desc = document.getElementById('esqueciPassoDesc');
  const alerta = document.getElementById('esqueciAlertaMsg');
  const codeBox = document.getElementById('esqueciCodeBox');

  if (passo1) passo1.style.display = 'block';
  if (passo2) passo2.style.display = 'none';
  if (desc) desc.textContent = 'Informe seu e-mail cadastrado para enviarmos o código de verificação.';
  if (alerta) alerta.style.display = 'none';
  if (codeBox) codeBox.style.display = 'none';
}

async function solicitarCodigoRecuperacao() {
  const emailInput = document.getElementById('esqueciEmail');
  const btn = document.getElementById('btnEnviarCodigo');
  const alerta = document.getElementById('esqueciAlertaMsg');
  const passo1 = document.getElementById('esqueciPasso1');
  const passo2 = document.getElementById('esqueciPasso2');
  const desc = document.getElementById('esqueciPassoDesc');
  const codeBox = document.getElementById('esqueciCodeBox');
  const codeDisplay = document.getElementById('esqueciCodeDisplay');
  const codigoInput = document.getElementById('esqueciCodigo');

  const email = (emailInput ? emailInput.value : '').toLowerCase().trim();
  if (!email) {
    if (alerta) {
      alerta.style.display = 'block';
      alerta.style.background = 'rgba(239, 68, 68, 0.15)';
      alerta.style.color = '#fca5a5';
      alerta.style.border = '1px solid #ef4444';
      alerta.textContent = 'Por favor, digite seu e-mail cadastrado.';
    }
    return;
  }

  // Verifica se o usuário existe no banco
  const user = await window.TruckDB.getUserByEmail(email);
  if (!user) {
    if (alerta) {
      alerta.style.display = 'block';
      alerta.style.background = 'rgba(239, 68, 68, 0.15)';
      alerta.style.color = '#fca5a5';
      alerta.style.border = '1px solid #ef4444';
      alerta.textContent = 'E-mail não encontrado no sistema. Verifique o endereço digitado ou crie uma conta.';
    }
    return;
  }

  // Gera código de 6 dígitos aleatório
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  currentResetCode = code;
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutos

  localStorage.setItem('truck_pwd_reset', JSON.stringify({ email, code, expiresAt }));

  // Disparo de e-mail:
  // 1. Notifica API backend se estiver online
  try {
    fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    }).catch(() => {});
  } catch (e) {}

  // 2. Prepara link mailto para abrir aplicativo de e-mail do motorista
  const subject = encodeURIComponent('Código de Recuperação de Senha - Checklist Truck Pro');
  const body = encodeURIComponent(
    `Olá, ${user.name}!\n\nSeu código de verificação para redefinir sua senha no Checklist Truck Pro é: ${code}\n\nEste código é válido por 15 minutos.\n\nSe você não solicitou a redefinição, basta ignorar esta mensagem.`
  );
  const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;

  // Avança para o Passo 2
  if (passo1) passo1.style.display = 'none';
  if (passo2) passo2.style.display = 'block';
  if (desc) desc.textContent = `Digite o código de 6 dígitos enviado para ${email} e defina sua nova senha.`;

  if (codeBox && codeDisplay) {
    codeDisplay.textContent = code;
    codeBox.style.display = 'block';
  }

  if (alerta) {
    alerta.style.display = 'block';
    alerta.style.background = 'rgba(16, 185, 129, 0.15)';
    alerta.style.color = '#6ee7b7';
    alerta.style.border = '1px solid #10b981';
    alerta.innerHTML = `
      <div>✅ Código gerado com sucesso para <strong>${escapeHtml(email)}</strong>!</div>
      <div style="margin-top: 8px;">
        <a href="${mailtoUrl}" target="_blank" style="display: inline-flex; align-items: center; gap: 4px; color: #38bdf8; text-decoration: underline; font-weight: 700;">
          📧 Abrir Aplicativo de E-mail
        </a>
      </div>
    `;
  }

  if (codigoInput) {
    codigoInput.value = '';
    codigoInput.focus();
  }
}

function preencherCodigoEsqueci() {
  const codigoInput = document.getElementById('esqueciCodigo');
  const pwdInput = document.getElementById('esqueciNovaSenha');
  if (currentResetCode && codigoInput) {
    codigoInput.value = currentResetCode;
  } else {
    try {
      const saved = JSON.parse(localStorage.getItem('truck_pwd_reset') || '{}');
      if (saved.code && codigoInput) codigoInput.value = saved.code;
    } catch (e) {}
  }
  if (pwdInput) pwdInput.focus();
}

async function confirmarNovaSenha() {
  const emailInput = document.getElementById('esqueciEmail');
  const codigoInput = document.getElementById('esqueciCodigo');
  const novaSenhaInput = document.getElementById('esqueciNovaSenha');
  const confirmaSenhaInput = document.getElementById('esqueciConfirmaSenha');
  const btn = document.getElementById('btnSalvarSenha');
  const alerta = document.getElementById('esqueciAlertaMsg');

  const email = (emailInput ? emailInput.value : '').toLowerCase().trim();
  const code = (codigoInput ? codigoInput.value : '').trim();
  const newPassword = novaSenhaInput ? novaSenhaInput.value : '';
  const confirmPassword = confirmaSenhaInput ? confirmaSenhaInput.value : '';

  const showStep2Error = (msg) => {
    if (alerta) {
      alerta.style.display = 'block';
      alerta.style.background = 'rgba(239, 68, 68, 0.15)';
      alerta.style.color = '#fca5a5';
      alerta.style.border = '1px solid #ef4444';
      alerta.textContent = msg;
    }
  };

  if (!code || !newPassword) {
    showStep2Error('Por favor, informe o código de verificação e a nova senha.');
    return;
  }

  if (newPassword.length < 4) {
    showStep2Error('A nova senha deve ter no mínimo 4 caracteres.');
    return;
  }

  if (newPassword !== confirmPassword) {
    showStep2Error('As senhas digitadas não coincidem. Digite a mesma senha nos dois campos.');
    return;
  }

  // Valida o código
  let resetData = null;
  try {
    resetData = JSON.parse(localStorage.getItem('truck_pwd_reset') || '{}');
  } catch (e) {}

  if (!resetData || resetData.email !== email || resetData.code !== code) {
    showStep2Error('Código de verificação incorreto. Verifique o número digitado.');
    return;
  }

  if (Date.now() > (resetData.expiresAt || 0)) {
    showStep2Error('Este código de verificação expirou (validade de 15 minutos). Solicite um novo código.');
    return;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span>Salvando nova senha...</span>`;
    }

    const user = await window.TruckDB.getUserByEmail(email);
    if (!user) {
      showStep2Error('Usuário não encontrado.');
      if (btn) { btn.disabled = false; btn.innerHTML = `<span>Salvar Nova Senha</span>`; }
      return;
    }

    const newHash = await hashPassword(newPassword);
    user.passwordHash = newHash;
    await window.TruckDB.updateUser(user);

    // Limpa requisição de reset
    localStorage.removeItem('truck_pwd_reset');
    currentResetCode = null;

    // Sucesso!
    if (alerta) {
      alerta.style.display = 'block';
      alerta.style.background = 'rgba(16, 185, 129, 0.15)';
      alerta.style.color = '#6ee7b7';
      alerta.style.border = '1px solid #10b981';
      alerta.textContent = '✅ Senha alterada com sucesso! Redirecionando para o login...';
    }

    // Preenche o formulário de login com as novas credenciais
    const authEmail = document.getElementById('authEmail');
    const authPassword = document.getElementById('authPassword');
    if (authEmail) authEmail.value = email;
    if (authPassword) authPassword.value = newPassword;

    setTimeout(() => {
      fecharModalEsqueciSenha();
      setAuthMode('login');
      showToast('Senha atualizada com sucesso! Você já pode entrar.', 'success');
    }, 1500);

  } catch (err) {
    console.error('Erro ao redefinir senha:', err);
    showStep2Error('Erro ao redefinir senha. Tente novamente.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>Salvar Nova Senha</span>`;
    }
  }
}

// ==========================================
// MODAL MEU USUÁRIO / PERFIL DO MOTORISTA
// ==========================================
function abrirModalMeuPerfil() {
  const user = getAuthUser();
  if (!user) return;

  const modal = document.getElementById('modalMeuPerfil');
  const nomeEl = document.getElementById('perfilNome');
  const emailEl = document.getElementById('perfilEmail');
  const dataEl = document.getElementById('perfilData');

  if (nomeEl) nomeEl.textContent = user.name || '---';
  if (emailEl) emailEl.textContent = user.email || '---';
  if (dataEl) {
    if (user.createdAt) {
      try {
        dataEl.textContent = new Date(user.createdAt).toLocaleDateString('pt-BR');
      } catch (e) {
        dataEl.textContent = '---';
      }
    } else {
      dataEl.textContent = '---';
    }
  }

  if (modal) modal.style.display = 'flex';
}

function fecharModalMeuPerfil() {
  const modal = document.getElementById('modalMeuPerfil');
  if (modal) modal.style.display = 'none';
}

function abrirAlterarSenhaDoPerfil() {
  const user = getAuthUser();
  fecharModalMeuPerfil();
  abrirModalEsqueciSenha();
  if (user && user.email) {
    const esqueciEmail = document.getElementById('esqueciEmail');
    if (esqueciEmail) esqueciEmail.value = user.email;
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
  togglePasswordVisibility,
  abrirModalEsqueciSenha,
  fecharModalEsqueciSenha,
  voltarPasso1Esqueci,
  solicitarCodigoRecuperacao,
  preencherCodigoEsqueci,
  confirmarNovaSenha,
  abrirModalMeuPerfil,
  fecharModalMeuPerfil,
  abrirAlterarSenhaDoPerfil
};


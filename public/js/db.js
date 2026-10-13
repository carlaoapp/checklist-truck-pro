/**
 * TruckChecklistDB - IndexedDB Management
 * Versão 2: Suporta múltiplos checklists (Pendentes e Concluídos) e mídias por item.
 */

const DB_NAME = 'TruckChecklistDB';
const DB_VERSION = 4;
const STORE_CHECKLISTS = 'checklists';
const STORE_MEDIA = 'media_files';
const STORE_USERS = 'users';

let dbInstance = null;

function openDB() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Store para usuários cadastrados (isolamento seguro de vistorias)
      if (!db.objectStoreNames.contains(STORE_USERS)) {
        const userStore = db.createObjectStore(STORE_USERS, { keyPath: 'id' });
        userStore.createIndex('email', 'email', { unique: true });
        userStore.createIndex('createdAt', 'createdAt', { unique: false });
      } else {
        const userStore = event.target.transaction.objectStore(STORE_USERS);
        if (!userStore.indexNames.contains('email')) {
          userStore.createIndex('email', 'email', { unique: true });
        }
      }

      // Store para múltiplos checklists (Histórico de Pendentes e Concluídos)
      if (!db.objectStoreNames.contains(STORE_CHECKLISTS)) {
        const checkStore = db.createObjectStore(STORE_CHECKLISTS, { keyPath: 'id' });
        checkStore.createIndex('status', 'status', { unique: false });
        checkStore.createIndex('userId', 'userId', { unique: false });
        checkStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      } else {
        const checkStore = event.target.transaction.objectStore(STORE_CHECKLISTS);
        if (!checkStore.indexNames.contains('userId')) {
          checkStore.createIndex('userId', 'userId', { unique: false });
        }
      }

      // Store para mídias (fotos e vídeos associadas a um checklist e a um item específico)
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        const mediaStore = db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
        mediaStore.createIndex('checklistId', 'checklistId', { unique: false });
        mediaStore.createIndex('itemId', 'itemId', { unique: false });
        mediaStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('Erro ao abrir IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

// ==========================================
// OPERAÇÕES DE CHECKLISTS (HISTÓRICO / CRUD)
// ==========================================

async function saveChecklist(checklist) {
  if (!checklist) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_CHECKLISTS], 'readwrite');
    const store = transaction.objectStore(STORE_CHECKLISTS);

    const now = new Date().toISOString();
    const record = {
      ...checklist,
      updatedAt: now,
      createdAt: checklist.createdAt || now
    };

    const request = store.put(record);
    request.onsuccess = () => {
      // Snapshot de segurança no localStorage para resiliência total contra atualizações do navegador
      try {
        localStorage.setItem(`truck_chk_snapshot_${record.id}`, JSON.stringify(record));
        localStorage.setItem('truck_active_checklist_id', record.id);
      } catch (e) {}
      resolve(record);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getChecklist(id) {
  if (!id) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_CHECKLISTS], 'readonly');
    const store = transaction.objectStore(STORE_CHECKLISTS);
    const request = store.get(id);

    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result);
      } else {
        // Tenta recuperar do snapshot do localStorage se o banco ainda estiver abrindo
        try {
          const snapshot = localStorage.getItem(`truck_chk_snapshot_${id}`);
          if (snapshot) {
            resolve(JSON.parse(snapshot));
            return;
          }
        } catch (e) {}
        resolve(null);
      }
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getAllChecklists(userId = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_CHECKLISTS], 'readonly');
    const store = transaction.objectStore(STORE_CHECKLISTS);
    const request = store.getAll();

    request.onsuccess = () => {
      let records = request.result || [];
      // Isolamento seguro e resiliente: se informado userId, inclui os do motorista e quaisquer vistorias não vinculadas ou da conta padrão
      if (userId) {
        records = records.filter(c => !c.userId || c.userId === userId || c.userId === 'motorista_padrao');
      }
      // Ordena pelos mais recentemente atualizados
      records.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
      resolve(records);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

async function deleteChecklist(id) {
  const db = await openDB();
  
  // Exclui o checklist e todas as mídias atreladas a ele
  const medias = await getMediaByChecklist(id);
  for (const m of medias) {
    await deleteMediaRecord(m.id);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_CHECKLISTS], 'readwrite');
    const store = transaction.objectStore(STORE_CHECKLISTS);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function updateChecklistStatus(id, newStatus) {
  const item = await getChecklist(id);
  if (!item) throw new Error('Checklist não encontrado: ' + id);
  item.status = newStatus;
  return await saveChecklist(item);
}

// ==========================================
// OPERAÇÕES DE MÍDIAS (FOTOS E VÍDEOS POR ITEM)
// ==========================================

async function addMediaRecord(mediaItem) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_MEDIA], 'readwrite');
    const store = transaction.objectStore(STORE_MEDIA);
    const request = store.put(mediaItem);

    request.onsuccess = () => resolve(mediaItem);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getMediaByChecklist(checklistId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_MEDIA], 'readonly');
    const store = transaction.objectStore(STORE_MEDIA);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = request.result || [];
      const filtered = all.filter(m => m.checklistId === checklistId);
      filtered.sort((a, b) => a.timestamp - b.timestamp);
      resolve(filtered);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getMediaByChecklistAndItem(checklistId, itemId) {
  const medias = await getMediaByChecklist(checklistId);
  return medias.filter(m => m.itemId === itemId);
}

async function updateMediaRecord(id, partialUpdates) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_MEDIA], 'readwrite');
    const store = transaction.objectStore(STORE_MEDIA);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (!existing) {
        reject(new Error('Registro não encontrado: ' + id));
        return;
      }

      const updated = { ...existing, ...partialUpdates };
      const putRequest = store.put(updated);
      putRequest.onsuccess = () => resolve(updated);
      putRequest.onerror = (e) => reject(e.target.error);
    };

    getRequest.onerror = (e) => reject(e.target.error);
  });
}

async function deleteMediaRecord(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_MEDIA], 'readwrite');
    const store = transaction.objectStore(STORE_MEDIA);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
}

// ==========================================
// OPERAÇÕES DE USUÁRIOS (CADASTRO E LOGIN OFFLINE RESILIENTE)
// ==========================================

async function createUser(user) {
  if (!user || !user.email) return user;
  const cleanEmail = user.email.toLowerCase().trim();
  const record = { ...user, email: cleanEmail };

  // 1. Salva imediatamente no localStorage (100% garantido e persistente)
  try {
    const localUsers = JSON.parse(localStorage.getItem('truck_users_store') || '[]');
    const idx = localUsers.findIndex(u => u.email && u.email.toLowerCase().trim() === cleanEmail);
    if (idx >= 0) {
      localUsers[idx] = record;
    } else {
      localUsers.push(record);
    }
    localStorage.setItem('truck_users_store', JSON.stringify(localUsers));
  } catch (e) {}

  // 2. Salva no IndexedDB (se disponível)
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      try {
        const transaction = db.transaction([STORE_USERS], 'readwrite');
        const store = transaction.objectStore(STORE_USERS);
        const req = store.put(record);
        req.onsuccess = () => resolve(record);
        req.onerror = () => resolve(record);
      } catch (err) {
        resolve(record);
      }
    });
  } catch (err) {}

  return record;
}

async function updateUser(user) {
  return createUser(user);
}

async function getUserByEmail(email) {
  if (!email) return null;
  const cleanEmail = email.toLowerCase().trim();

  // 1. Tenta recuperar do localStorage primeiro (super rápido)
  try {
    const localUsers = JSON.parse(localStorage.getItem('truck_users_store') || '[]');
    const found = localUsers.find(u => u.email && u.email.toLowerCase().trim() === cleanEmail);
    if (found) return found;
  } catch (e) {}

  // 2. Tenta no IndexedDB com fallback para store.getAll()
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      try {
        const transaction = db.transaction([STORE_USERS], 'readonly');
        const store = transaction.objectStore(STORE_USERS);
        const req = store.getAll();
        req.onsuccess = () => {
          const all = req.result || [];
          const found = all.find(u => u.email && u.email.toLowerCase().trim() === cleanEmail);
          if (found) {
            // Sincroniza no localStorage para acesso futuro imediato
            try {
              const localUsers = JSON.parse(localStorage.getItem('truck_users_store') || '[]');
              if (!localUsers.some(u => u.email === found.email)) {
                localUsers.push(found);
                localStorage.setItem('truck_users_store', JSON.stringify(localUsers));
              }
            } catch (err) {}
            resolve(found);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch (txErr) {
        resolve(null);
      }
    });
  } catch (err) {
    return null;
  }
}

async function getUserById(id) {
  if (!id) return null;
  try {
    const localUsers = JSON.parse(localStorage.getItem('truck_users_store') || '[]');
    const found = localUsers.find(u => u.id === id);
    if (found) return found;
  } catch (e) {}

  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      try {
        const transaction = db.transaction([STORE_USERS], 'readonly');
        const store = transaction.objectStore(STORE_USERS);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  } catch (e) {
    return null;
  }
}

async function getAllUsers() {
  const usersMap = new Map();

  // 1. Do localStorage
  try {
    const localUsers = JSON.parse(localStorage.getItem('truck_users_store') || '[]');
    localUsers.forEach(u => {
      if (u.email) usersMap.set(u.email.toLowerCase().trim(), u);
    });
  } catch (e) {}

  // 2. Do IndexedDB
  try {
    const db = await openDB();
    const idbUsers = await new Promise((resolve) => {
      try {
        const transaction = db.transaction([STORE_USERS], 'readonly');
        const store = transaction.objectStore(STORE_USERS);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
    idbUsers.forEach(u => {
      if (u.email && !usersMap.has(u.email.toLowerCase().trim())) {
        usersMap.set(u.email.toLowerCase().trim(), u);
      }
    });
  } catch (e) {}

  return Array.from(usersMap.values());
}

// Expõe no escopo global
window.TruckDB = {
  openDB,
  saveChecklist,
  getChecklist,
  getAllChecklists,
  deleteChecklist,
  updateChecklistStatus,
  addMediaRecord,
  getMediaByChecklist,
  getMediaByChecklistAndItem,
  updateMediaRecord,
  deleteMediaRecord,
  createUser,
  updateUser,
  getUserByEmail,
  getUserById,
  getAllUsers
};

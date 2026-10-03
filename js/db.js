/**
 * TruckChecklistDB - IndexedDB Management
 * Versão 2: Suporta múltiplos checklists (Pendentes e Concluídos) e mídias por item.
 */

const DB_NAME = 'TruckChecklistDB';
const DB_VERSION = 3;
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
    request.onsuccess = () => resolve(record);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getChecklist(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_CHECKLISTS], 'readonly');
    const store = transaction.objectStore(STORE_CHECKLISTS);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
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
      // Isolamento seguro por usuário: se informado userId, filtra apenas os do motorista atual
      if (userId) {
        records = records.filter(c => c.userId === userId || !c.userId);
      }
      // Ordena pelos mais recentemente atualizados
      records.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
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
// OPERAÇÕES DE USUÁRIOS (CADASTRO E LOGIN OFFLINE)
// ==========================================

async function createUser(user) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_USERS], 'readwrite');
    const store = transaction.objectStore(STORE_USERS);
    const request = store.add(user);

    request.onsuccess = () => resolve(user);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getUserByEmail(email) {
  if (!email) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_USERS], 'readonly');
    const store = transaction.objectStore(STORE_USERS);
    const index = store.index('email');
    const cleanEmail = email.toLowerCase().trim();
    const request = index.get(cleanEmail);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getUserById(id) {
  if (!id) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_USERS], 'readonly');
    const store = transaction.objectStore(STORE_USERS);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getAllUsers() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_USERS], 'readonly');
    const store = transaction.objectStore(STORE_USERS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
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
  getUserByEmail,
  getUserById,
  getAllUsers
};

// ── Theme toggle ──────────────────────────────────────────────────────────────
(function(){
  const html = document.documentElement;
  const saved = localStorage.getItem('qn_theme');
  const sys = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  let theme = saved || sys;
  html.setAttribute('data-theme', theme);

  const btn = document.getElementById('btn-theme');
  function updateIcon() {
    btn.innerHTML = theme === 'dark'
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  }
  updateIcon();
  btn.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', theme);
    localStorage.setItem('qn_theme', theme);
    updateIcon();
  });
})();

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function formatDate(ts) {
  const d = new Date(ts), now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function highlightText(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi');
  return escaped.replace(re, '<em>$1</em>');
}

// ── State ─────────────────────────────────────────────────────────────────────
let allNotes = [];
let currentNote = null;
let searchQuery = '';
let pendingMode = null;
let isDirty = false;

// ── Views ─────────────────────────────────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelector('.search-wrap').style.display = id === 'view-list' ? '' : 'none';
}

// ── Render list ───────────────────────────────────────────────────────────────
function renderList(notes) {
  const list = document.getElementById('notes-list');
  const empty = document.getElementById('empty-state');
  const q = searchQuery.toLowerCase();
  const filtered = q
    ? notes.filter(n => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
    : notes;

  // Sort: pinned first, then by updatedAt
  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  list.innerHTML = '';
  if (!sorted.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  sorted.forEach(note => {
    const card = document.createElement('div');
    card.className = 'note-card' + (note.pinned ? ' pinned' : '');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', note.title || 'Untitled');
    const title = note.title || 'Untitled';
    const preview = note.body.replace(/\n+/g, ' ').slice(0, 100);
    card.innerHTML = `
      <div class="note-card-body">
        <div class="note-card-title">${highlightText(title, q)}</div>
        <div class="note-card-preview">${highlightText(preview, q)}</div>
      </div>
      <div class="note-card-date">${formatDate(note.updatedAt)}</div>`;
    card.addEventListener('click', () => openEditor(note.id));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') openEditor(note.id); });
    list.appendChild(card);
  });
}

// ── Open editor ───────────────────────────────────────────────────────────────
async function openEditor(id) {
  if (id) {
    currentNote = allNotes.find(n => n.id === id) || null;
  } else {
    currentNote = { id: uid(), title: '', body: '', createdAt: Date.now(), updatedAt: Date.now(), pinned: false };
  }
  const titleEl = document.getElementById('note-title');
  const bodyEl  = document.getElementById('note-body');
  const pinBtn  = document.getElementById('btn-pin');
  titleEl.value = currentNote.title;
  bodyEl.value  = currentNote.body;
  updatePinButton();
  updateMeta();
  updateCharCount();
  isDirty = false;
  showView('view-editor');
  bodyEl.focus();
}

function updatePinButton() {
  const btn = document.getElementById('btn-pin');
  btn.style.color = currentNote.pinned ? 'var(--color-primary)' : '';
  btn.title = currentNote.pinned ? 'Unpin note' : 'Pin note';
}

function updateMeta() {
  const meta = document.getElementById('note-meta');
  if (!currentNote) return;
  const isNew = !allNotes.find(n => n.id === currentNote.id);
  meta.textContent = isNew ? 'New note' : 'Edited ' + formatDate(currentNote.updatedAt);
}

function updateCharCount() {
  const body = document.getElementById('note-body').value;
  document.getElementById('char-count').textContent = body.length.toLocaleString() + ' chars';
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function saveNote() {
  if (!currentNote) return;
  currentNote.title    = document.getElementById('note-title').value.trim();
  currentNote.body     = document.getElementById('note-body').value;
  currentNote.updatedAt = Date.now();
  await Storage.save(currentNote);
  // Refresh allNotes
  const idx = allNotes.findIndex(n => n.id === currentNote.id);
  if (idx >= 0) allNotes[idx] = currentNote; else allNotes.unshift(currentNote);
  isDirty = false;
  updateMeta();
  showToast('Note saved');
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function deleteNote(id) {
  await Storage.delete(id);
  allNotes = allNotes.filter(n => n.id !== id);
  renderList(allNotes);
  showView('view-list');
  showToast('Note deleted');
  refreshStats();
}

// ── Load all ──────────────────────────────────────────────────────────────────
async function loadNotes() {
  allNotes = await Storage.getAll();
  renderList(allNotes);
  refreshStats();
}

// ── Settings ──────────────────────────────────────────────────────────────────
function initSettingsRadios() {
  const mode = Storage.getMode();
  document.querySelectorAll('input[name="storage"]').forEach(r => {
    r.checked = r.value === mode;
    r.closest('.storage-option').classList.toggle('selected', r.checked);
  });
  document.getElementById('stat-backend').textContent = mode === 'idb' ? 'IndexedDB' : 'localStorage';
}

async function refreshStats() {
  const count = await Storage.count();
  document.getElementById('stat-count').textContent = count;
  document.getElementById('stat-backend').textContent = Storage.getMode() === 'idb' ? 'IndexedDB' : 'localStorage';
}

// ── Wire up events ────────────────────────────────────────────────────────────
document.getElementById('btn-new').addEventListener('click', () => openEditor(null));
document.getElementById('btn-back').addEventListener('click', async () => {
  if (isDirty) await saveNote();
  await loadNotes();
  showView('view-list');
});

document.getElementById('btn-save').addEventListener('click', saveNote);
document.getElementById('note-title').addEventListener('input', () => { isDirty = true; });
document.getElementById('note-body').addEventListener('input', () => { isDirty = true; updateCharCount(); });

document.getElementById('btn-pin').addEventListener('click', async () => {
  if (!currentNote) return;
  currentNote.pinned = !currentNote.pinned;
  currentNote.updatedAt = Date.now();
  await Storage.save(currentNote);
  const idx = allNotes.findIndex(n => n.id === currentNote.id);
  if (idx >= 0) allNotes[idx] = currentNote; else allNotes.unshift(currentNote);
  updatePinButton();
  showToast(currentNote.pinned ? 'Note pinned' : 'Note unpinned');
});

document.getElementById('btn-delete').addEventListener('click', async () => {
  if (!currentNote) return;
  if (!confirm('Delete this note?')) return;
  await deleteNote(currentNote.id);
  currentNote = null;
});

// Search
document.getElementById('search').addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  renderList(allNotes);
});

// Keyboard shortcut: Ctrl+S to save
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    const editor = document.getElementById('view-editor');
    if (editor.classList.contains('active')) saveNote();
  }
});

// Settings
document.getElementById('btn-settings').addEventListener('click', () => {
  initSettingsRadios();
  refreshStats();
  showView('view-settings');
  pendingMode = null;
  document.getElementById('migrate-bar').classList.add('hidden');
});
document.getElementById('btn-settings-back').addEventListener('click', async () => {
  await loadNotes();
  showView('view-list');
});

// Storage mode change
document.querySelectorAll('input[name="storage"]').forEach(r => {
  r.addEventListener('change', () => {
    const newMode = r.value;
    const curMode = Storage.getMode();
    document.querySelectorAll('.storage-option').forEach(o => {
      o.classList.toggle('selected', o.querySelector('input').value === newMode);
    });
    if (newMode === curMode) {
      document.getElementById('migrate-bar').classList.add('hidden');
      pendingMode = null;
      return;
    }
    pendingMode = newMode;
    const fromLabel = curMode === 'idb' ? 'IndexedDB' : 'localStorage';
    const toLabel   = newMode === 'idb' ? 'IndexedDB' : 'localStorage';
    document.getElementById('migrate-msg').textContent = `Migrate ${allNotes.length} note(s) from ${fromLabel} → ${toLabel}?`;
    document.getElementById('migrate-bar').classList.remove('hidden');
  });
});

document.getElementById('btn-migrate').addEventListener('click', async () => {
  if (!pendingMode) return;
  try {
    await Storage.migrate(pendingMode);
    allNotes = await Storage.getAll();
    pendingMode = null;
    document.getElementById('migrate-bar').classList.add('hidden');
    initSettingsRadios();
    refreshStats();
    showToast('Migrated successfully');
  } catch (err) {
    showToast('Migration failed: ' + err.message);
  }
});
document.getElementById('btn-migrate-cancel').addEventListener('click', () => {
  pendingMode = null;
  document.getElementById('migrate-bar').classList.add('hidden');
  initSettingsRadios();
});

// Export
document.getElementById('btn-export').addEventListener('click', async () => {
  const notes = await Storage.getAll();
  const blob = new Blob([JSON.stringify({ version: 1, exported: Date.now(), notes }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'quicknotes-export.json'; a.click();
  URL.revokeObjectURL(url);
  showToast('Exported ' + notes.length + ' note(s)');
});

// Import
document.getElementById('inp-import').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const notes = Array.isArray(data) ? data : (data.notes || []);
    let count = 0;
    for (const n of notes) {
      if (!n.id || typeof n.body === 'undefined') continue;
      await Storage.save({ ...n, updatedAt: n.updatedAt || Date.now(), createdAt: n.createdAt || Date.now() });
      count++;
    }
    allNotes = await Storage.getAll();
    refreshStats();
    showToast('Imported ' + count + ' note(s)');
  } catch {
    showToast('Import failed — invalid file');
  }
  e.target.value = '';
});

// Delete all
document.getElementById('btn-delete-all').addEventListener('click', async () => {
  const count = await Storage.count();
  if (!count) { showToast('No notes to delete'); return; }
  if (!confirm(`Delete all ${count} note(s)? This cannot be undone.`)) return;
  const notes = await Storage.getAll();
  for (const n of notes) await Storage.delete(n.id);
  allNotes = [];
  refreshStats();
  showToast('All notes deleted');
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadNotes();
showView('view-list');

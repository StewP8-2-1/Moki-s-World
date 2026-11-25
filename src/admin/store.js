/**
 * Editor document store.
 * - Holds the draft world (scenes + objects) and applies edits locally first (instant UI).
 * - Persists to the admin API: per-entity ordered queues, debounced PATCHes.
 * - Undo/redo history; rapid edits to the same field coalesce into one step (typing, dragging, nudging).
 *
 * Events (store.on(name, fn)):
 *   object:create (obj, sceneId) · object:update (obj, sceneId) · object:delete (id, sceneId)
 *   scene:update (scene) · scenes:change () · history ({ canUndo, canRedo })
 *   status ({ state: 'saving' | 'saved' | 'error', message? }) · dirty (bool) · error (message)
 */
import { api } from './api.js';

const PATCH_DELAY_MS = 350;
const COALESCE_MS = 1200;
const HISTORY_LIMIT = 200;

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

/** Pick the current values of the keys present in `patch` (props picked key-by-key). */
function pickBefore(target, patch) {
  const out = {};
  for (const key of Object.keys(patch)) {
    if (key === 'props') {
      out.props = {};
      for (const pk of Object.keys(patch.props)) out.props[pk] = clone(target.props?.[pk] ?? null);
    } else {
      out[key] = clone(target[key]);
    }
  }
  return out;
}

function applyPatch(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'props') target.props = { ...target.props, ...clone(value) };
    else target[key] = clone(value);
  }
}

function mergePatch(a, b) {
  const out = { ...a, ...b };
  if (a.props || b.props) out.props = { ...(a.props || {}), ...(b.props || {}) };
  return out;
}

export function createStore() {
  const listeners = new Map();
  const emit = (name, ...args) => listeners.get(name)?.forEach((fn) => fn(...args));

  let world = null;
  let undoStack = [];
  let redoStack = [];
  let inflight = 0;
  let lastError = null;
  const queues = new Map(); // key -> Promise chain
  const pending = new Map(); // object id -> { patch, timer }

  // ---------- lookup ----------
  const scenes = () => world?.scenes ?? [];
  const getScene = (id) => scenes().find((s) => s.id === id);
  function findObject(id) {
    for (const scene of scenes()) {
      const obj = scene.objects.find((o) => o.id === id);
      if (obj) return { obj, scene };
    }
    return null;
  }

  // ---------- persistence ----------
  function setStatus() {
    if (lastError) emit('status', { state: 'error', message: lastError });
    else emit('status', { state: inflight > 0 || pending.size > 0 ? 'saving' : 'saved' });
  }

  function enqueue(key, task) {
    const prev = queues.get(key) || Promise.resolve();
    inflight++;
    setStatus();
    const next = prev
      .then(task)
      .then(() => {
        lastError = null;
        emit('dirty', true);
      })
      .catch((err) => {
        lastError = err.message || 'Save failed';
        emit('error', `Not saved: ${lastError}`);
      })
      .finally(() => {
        inflight--;
        setStatus();
      });
    queues.set(key, next);
    return next;
  }

  function queuePatch(id, patch) {
    const entry = pending.get(id) || { patch: {} };
    entry.patch = mergePatch(entry.patch, patch);
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => flushPatch(id), PATCH_DELAY_MS);
    pending.set(id, entry);
    setStatus();
  }

  function flushPatch(id) {
    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(id);
    enqueue(id, () => api.patchObject(id, entry.patch));
  }

  function cancelPatch(id) {
    const entry = pending.get(id);
    if (entry) clearTimeout(entry.timer);
    pending.delete(id);
  }

  // ---------- history ----------
  function record(entry) {
    const top = undoStack[undoStack.length - 1];
    if (entry.coalesceKey && top?.coalesceKey === entry.coalesceKey && Date.now() - top.time < COALESCE_MS) {
      // Merge into the previous step: keep the earliest "before" for every key, latest "after".
      const extraBefore = {};
      for (const [k, v] of Object.entries(entry.before)) {
        if (k === 'props') {
          extraBefore.props = {};
          for (const [pk, pv] of Object.entries(v)) if (!(pk in (top.before.props || {}))) extraBefore.props[pk] = pv;
        } else if (!(k in top.before)) extraBefore[k] = v;
      }
      top.before = mergePatch(extraBefore, top.before);
      top.after = mergePatch(top.after, entry.after);
      top.time = Date.now();
    } else {
      undoStack.push({ ...entry, time: Date.now() });
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    }
    redoStack = [];
    emitHistory();
  }
  const emitHistory = () => emit('history', { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });

  // ---------- raw operations (no history) ----------
  function rawUpdateObject(id, patch) {
    const found = findObject(id);
    if (!found) return;
    applyPatch(found.obj, patch);
    emit('object:update', found.obj, found.scene.id);
    queuePatch(id, patch);
  }

  function rawCreateObject(sceneId, obj) {
    const scene = getScene(sceneId);
    if (!scene) return;
    scene.objects.push(obj);
    emit('object:create', obj, sceneId);
    emit('scenes:change');
    enqueue(obj.id, () => api.createObject({ ...obj, sceneId }));
  }

  function rawDeleteObject(id) {
    const found = findObject(id);
    if (!found) return;
    cancelPatch(id);
    found.scene.objects = found.scene.objects.filter((o) => o.id !== id);
    emit('object:delete', id, found.scene.id);
    emit('scenes:change');
    enqueue(id, () => api.deleteObject(id));
  }

  function rawUpdateScene(id, patch) {
    const scene = getScene(id);
    if (!scene) return;
    applyPatch(scene, patch);
    emit('scene:update', scene);
    enqueue(`scene:${id}`, () => api.updateScene(id, patch));
  }

  const ops = {
    update: { undo: (e) => rawUpdateObject(e.id, e.before), redo: (e) => rawUpdateObject(e.id, e.after) },
    create: { undo: (e) => rawDeleteObject(e.obj.id), redo: (e) => rawCreateObject(e.sceneId, clone(e.obj)) },
    delete: { undo: (e) => rawCreateObject(e.sceneId, clone(e.obj)), redo: (e) => rawDeleteObject(e.obj.id) },
    scene: { undo: (e) => rawUpdateScene(e.id, e.before), redo: (e) => rawUpdateScene(e.id, e.after) },
  };

  // ---------- public API ----------
  return {
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name).delete(fn);
    },

    load(draftWorld) {
      world = draftWorld;
      undoStack = [];
      redoStack = [];
      emitHistory();
    },
    get world() { return world; },
    getScene,
    findObject,

    /** Update object fields; `coalesceKey` merges rapid edits (typing, dragging) into one undo step. */
    updateObject(id, patch, { coalesceKey = null } = {}) {
      const found = findObject(id);
      if (!found) return;
      const before = pickBefore(found.obj, patch);
      rawUpdateObject(id, patch);
      record({ type: 'update', id, before, after: clone(patch), coalesceKey: coalesceKey && `${id}:${coalesceKey}` });
    },

    createObject(sceneId, data) {
      const obj = { rotation: 0, visible: true, depth: 0, size: 100, ...clone(data) };
      if (!obj.id) obj.id = crypto.randomUUID();
      delete obj.sceneId;
      rawCreateObject(sceneId, obj);
      record({ type: 'create', sceneId, obj: clone(obj) });
      return obj;
    },

    deleteObject(id) {
      const found = findObject(id);
      if (!found) return;
      flushPatch(id);
      record({ type: 'delete', sceneId: found.scene.id, obj: clone(found.obj) });
      rawDeleteObject(id);
    },

    updateScene(id, patch, { coalesceKey = null } = {}) {
      const scene = getScene(id);
      if (!scene) return;
      const before = pickBefore(scene, patch);
      rawUpdateScene(id, patch);
      record({ type: 'scene', id, before, after: clone(patch), coalesceKey: coalesceKey && `scene:${id}:${coalesceKey}` });
    },

    /** Scene create/delete are not undoable (they are confirmed in the UI instead). */
    async createScene(data) {
      const { scene } = await api.createScene(data);
      world.scenes.push({ ...scene, objects: [] });
      emit('scenes:change');
      emit('dirty', true);
      return getScene(scene.id);
    },

    async deleteScene(id) {
      await api.deleteScene(id);
      world.scenes = world.scenes.filter((s) => s.id !== id);
      // Drop history steps that touch the deleted scene's objects
      const live = (e) => e.type === 'scene' ? e.id !== id : e.sceneId !== id && (e.type !== 'update' || findObject(e.id));
      undoStack = undoStack.filter(live);
      redoStack = redoStack.filter(live);
      emitHistory();
      emit('scenes:change');
      emit('dirty', true);
    },

    undo() {
      const entry = undoStack.pop();
      if (!entry) return null;
      ops[entry.type].undo(entry);
      redoStack.push(entry);
      emitHistory();
      return entry;
    },

    redo() {
      const entry = redoStack.pop();
      if (!entry) return null;
      ops[entry.type].redo(entry);
      undoStack.push(entry);
      emitHistory();
      return entry;
    },

    /** Flush debounced saves now (e.g. before leaving the page) and wait for every queue. */
    async flush() {
      for (const id of [...pending.keys()]) flushPatch(id);
      await Promise.all([...queues.values()]);
    },

    get isSaving() { return inflight > 0 || pending.size > 0; },
  };
}

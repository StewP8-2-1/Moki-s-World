/**
 * Media picker + uploader.
 * - Uploads go straight from the browser to Vercel Blob (token from /api/admin/upload), then are
 *   recorded in the media library (/api/admin/assets).
 * - Very large images are downscaled in the browser first (longest side 2560 px) so the game stays light.
 * - The picker shows uploaded images and images already used in the world (e.g. legacy files in /public).
 */
import { api } from './api.js';
import { el } from './inspector.js';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 2560;

const $ = (id) => document.getElementById(id);
const safeName = (name) => {
  const dot = name.lastIndexOf('.');
  const base = (dot > 0 ? name.slice(0, dot) : name).normalize('NFKD').replace(/[^\w.\- ()]/g, '').trim().slice(0, 80) || 'image';
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  return ext ? `${base}.${ext}` : base;
};

async function readDimensions(blob) {
  const bmp = await createImageBitmap(blob);
  const dims = { width: bmp.width, height: bmp.height };
  bmp.close?.();
  return dims;
}

/** Downscale very large still images; returns { blob, width, height, type }. */
async function prepare(file) {
  const { width, height } = await readDimensions(file);
  const longest = Math.max(width, height);
  if (file.type === 'image/gif' || longest <= MAX_SIDE) return { blob: file, width, height, type: file.type };
  const scale = MAX_SIDE / longest;
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(await createImageBitmap(file), 0, 0, w, h);
  const type = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
  return { blob, width: w, height: h, type };
}

/** Upload one image file. onProgress(percent). Resolves to the recorded asset. */
export async function uploadImage(file, onProgress = () => {}) {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error(`${file.name}: only PNG, JPG, WebP or GIF images`);
  const prepared = await prepare(file);
  if (prepared.blob.size > MAX_BYTES) throw new Error(`${file.name}: larger than 10 MB`);
  const name = safeName(file.name);
  const { upload } = await import('@vercel/blob/client'); // loaded only when uploading
  const result = await upload(`uploads/${name}`, prepared.blob, {
    access: 'public',
    handleUploadUrl: '/api/admin/upload',
    contentType: prepared.type,
    onUploadProgress: ({ percentage }) => onProgress(Math.round(percentage)),
  });
  const { asset } = await api.addAsset({ url: result.url, name, width: prepared.width, height: prepared.height });
  return asset;
}

/**
 * Picker dialog. `open({ current, worldImages })` resolves to the chosen URL, or null if cancelled.
 */
export function createMediaPicker({ toast }) {
  const dialog = $('media-dialog');
  const grid = $('media-grid');
  const inUse = $('media-inuse');
  const fileInput = $('media-file');
  const drop = $('media-drop');
  const progress = $('media-progress');
  const useBtn = $('media-use');
  let chosen = null;
  let resolver = null;

  function tile(url, name, meta = '') {
    return el('button', {
      type: 'button', class: 'media-tile', 'data-url': url, title: name,
      'aria-pressed': String(url === chosen),
      onclick: () => choose(url),
      ondblclick: () => finish(url),
    }, el('img', { src: url, alt: '', loading: 'lazy' }), el('span', { class: 'media-name', text: name }), meta && el('span', { class: 'media-meta', text: meta }));
  }

  function choose(url) {
    chosen = url;
    useBtn.disabled = !url;
    for (const t of dialog.querySelectorAll('.media-tile')) t.setAttribute('aria-pressed', String(t.dataset.url === url));
  }

  function finish(url) {
    const r = resolver;
    resolver = null;
    dialog.close();
    r?.(url);
  }

  async function refresh(worldImages) {
    grid.replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));
    try {
      const { assets } = await api.assets();
      grid.replaceChildren(...assets.map((a) => tile(a.url, a.name, a.width ? `${a.width}×${a.height}` : '')));
      if (!assets.length) grid.append(el('p', { class: 'muted', text: 'No uploads yet. Upload your first image above.' }));
    } catch (err) {
      grid.replaceChildren(el('p', { class: 'error', text: err.message }));
    }
    inUse.replaceChildren(...worldImages.map((url) => tile(url, decodeURIComponent(url.split('/').pop()))));
  }

  async function handleFiles(files) {
    const list = [...files];
    if (!list.length) return;
    let last = null;
    for (const file of list) {
      const row = el('div', { class: 'upload-row' }, el('span', { text: file.name }), el('progress', { max: 100, value: 0 }));
      progress.append(row);
      try {
        const asset = await uploadImage(file, (p) => { row.querySelector('progress').value = p; });
        row.remove();
        last = asset;
        grid.querySelector('.muted')?.remove();
        grid.prepend(tile(asset.url, asset.name, asset.width ? `${asset.width}×${asset.height}` : ''));
      } catch (err) {
        row.replaceChildren(el('span', { class: 'error', text: `⚠ ${err.message}` }));
        toast(`Upload failed: ${err.message}`, { type: 'error', timeout: 8000 });
      }
    }
    if (last) choose(last.url);
  }

  fileInput.addEventListener('change', () => { handleFiles(fileInput.files); fileInput.value = ''; });
  drop.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); drop.classList.add('over'); } });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); handleFiles(e.dataTransfer.files); });
  useBtn.addEventListener('click', (e) => { e.preventDefault(); if (chosen) finish(chosen); });
  $('media-cancel').addEventListener('click', (e) => { e.preventDefault(); finish(null); });
  dialog.addEventListener('close', () => { if (resolver) finish(null); });

  return {
    open({ current = null, worldImages = [] } = {}) {
      progress.replaceChildren();
      choose(current);
      refresh(worldImages);
      dialog.showModal();
      return new Promise((resolve) => { resolver = resolve; });
    },
  };
}

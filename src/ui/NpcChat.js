/**
 * NPC chat panel: a DOM overlay (Phaser has no text input) docked to the bottom of the screen.
 * Talks to POST /api/npc and renders its NDJSON stream (text deltas, tool activity, source links).
 * Conversation history is kept in memory per NPC for this page session.
 *
 * All text is inserted with textContent; only http(s) source links are rendered as anchors.
 */
const histories = new Map(); // npcId -> [{ role, content }]
const TOOL_LABELS = {
  lookup_reference: 'checking notes…',
  fetch_page: 'reading a page…',
  search_web: 'searching…',
};
const MAX_INPUT = 500;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

export class NpcChat {
  constructor({ onClose } = {}) {
    this.onClose = onClose;
    this.isOpen = false;
    this.npcId = null;
    this.busy = false;
    this.abort = null;
    this.build();
  }

  build() {
    this.root = el('section', 'npc-chat');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Chat');
    this.root.hidden = true;

    const header = el('header', 'npc-chat__header');
    this.title = el('h2', 'npc-chat__title');
    const close = el('button', 'npc-chat__close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close chat');
    close.addEventListener('click', () => this.close());
    header.append(this.title, close);

    this.log = el('div', 'npc-chat__log');
    this.log.setAttribute('aria-live', 'polite');

    this.form = el('form', 'npc-chat__form');
    this.input = el('input', 'npc-chat__input');
    Object.assign(this.input, { type: 'text', maxLength: MAX_INPUT, placeholder: 'Say something…', autocomplete: 'off', enterKeyHint: 'send' });
    this.sendBtn = el('button', 'npc-chat__send', 'Send');
    this.sendBtn.type = 'submit';
    this.form.append(this.input, this.sendBtn);
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.send();
    });

    // Keep keystrokes away from the game; Esc closes.
    this.root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.close();
    });
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());

    this.root.append(header, this.log, this.form);
    document.body.append(this.root);
  }

  open({ npcId, name, greeting, draft = false }) {
    this.abort?.abort();
    this.npcId = npcId;
    this.draft = draft;
    this.name = name || 'NPC';
    this.title.textContent = this.name;
    this.log.replaceChildren();
    if (greeting) this.addBubble('npc', greeting);
    for (const m of histories.get(npcId) || []) this.addBubble(m.role === 'user' ? 'me' : 'npc', m.content);
    this.root.hidden = false;
    this.isOpen = true;
    this.setBusy(false);
    setTimeout(() => this.input.focus(), 0);
  }

  close() {
    if (!this.isOpen) return;
    this.abort?.abort();
    this.root.hidden = true;
    this.isOpen = false;
    this.input.blur();
    this.onClose?.();
  }

  destroy() {
    this.abort?.abort();
    this.root.remove();
  }

  setBusy(busy) {
    this.busy = busy;
    this.sendBtn.disabled = busy;
    this.input.disabled = busy;
    if (!busy && this.isOpen) this.input.focus();
  }

  addBubble(who, text) {
    const bubble = el('div', `npc-chat__msg npc-chat__msg--${who}`);
    const body = el('p', 'npc-chat__text', text);
    bubble.append(body);
    this.log.append(bubble);
    this.log.scrollTop = this.log.scrollHeight;
    return { bubble, body };
  }

  addSource(bubble, { url, title }) {
    if (!/^https?:\/\//i.test(url || '')) return;
    let list = bubble.querySelector('.npc-chat__sources');
    if (!list) {
      list = el('ul', 'npc-chat__sources');
      bubble.append(list);
    }
    const a = el('a', null, title || new URL(url).hostname);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const li = el('li');
    li.append(a);
    list.append(li);
  }

  async send() {
    const text = this.input.value.trim().slice(0, MAX_INPUT);
    if (!text || this.busy) return;
    const npcId = this.npcId;
    const history = histories.get(npcId) || [];
    history.push({ role: 'user', content: text });
    histories.set(npcId, history);
    this.input.value = '';
    this.addBubble('me', text);

    const { bubble, body } = this.addBubble('npc', '');
    bubble.classList.add('is-thinking');
    const status = el('span', 'npc-chat__status', '…');
    bubble.append(status);
    this.setBusy(true);
    this.abort = new AbortController();
    let reply = '';

    try {
      const res = await fetch('/api/npc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ npcId, messages: history.slice(-12), ...(this.draft ? { draft: true } : {}) }),
        signal: this.abort.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Something went wrong (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === 'text') {
            reply += ev.delta;
            body.textContent = reply;
            status.textContent = '';
          } else if (ev.type === 'tool') {
            status.textContent = TOOL_LABELS[ev.name] || '…';
          } else if (ev.type === 'source') {
            this.addSource(bubble, ev);
          } else if (ev.type === 'error') {
            throw new Error(ev.message);
          }
          this.log.scrollTop = this.log.scrollHeight;
        }
      }
      if (!reply) throw new Error('…(no answer)');
      history.push({ role: 'assistant', content: reply });
    } catch (err) {
      if (err.name === 'AbortError') {
        history.pop(); // unanswered question
        return;
      }
      history.pop();
      bubble.classList.add('is-error');
      body.textContent = err.message || 'Something went wrong.';
    } finally {
      bubble.classList.remove('is-thinking');
      status.remove();
      this.abort = null;
      this.setBusy(false);
    }
  }
}

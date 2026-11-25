/**
 * Game-only interactions for world objects (the editor never calls these).
 *
 * Every interactive object works the same way with every input type:
 * - pointer (mouse / touch): click or tap the object
 * - keyboard / gamepad / touch ACT button: walk up to it; WorldScene picks the nearest registered
 *   interactable in range, shows a prompt above the player, and calls its `activate()` on interact.
 * Portals use physics overlap instead, so they already work for every input.
 */

/**
 * Opens a URL. Returns false when a new tab was blocked by the browser (e.g. the request came
 * from a gamepad, which isn't a "user gesture"), so callers can offer a clickable fallback.
 */
function openUrl(url, newTab = true) {
  if (!/^https?:\/\//i.test(url || '')) return true; // nothing valid to open
  if (!newTab) {
    window.location.href = url;
    return true;
  }
  const win = window.open(url, '_blank');
  if (!win) return false;
  win.opener = null;
  return true;
}

/**
 * Short single-line name for the HUD prompt: the last non-empty line of a title (painting titles
 * are "Requested by: …\nArtwork name"), capped in length.
 */
function promptName(text) {
  const line = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() || '';
  return line.length > 32 ? `${line.slice(0, 31)}…` : line;
}

/** Hover previews the dialogue (mouse only); click / interact locks it, and clicking again closes it. */
function attachDialogue(scene, view, data, { pan }) {
  const target = view.main;
  const open = () => scene.openDialogue(data, target, { pan });

  target.setInteractive({ useHandCursor: true });
  target.on('pointerover', (pointer) => {
    if (pointer.wasTouch || scene.isDialogueLocked) return;
    scene.showDialogue(data, { placement: scene.dialoguePlacementFor(target.x, target.y) });
  });
  target.on('pointerout', () => { if (!scene.isDialogueLocked) scene.hideDialogue(); });
  target.on('pointerdown', (pointer, localX, localY, event) => {
    event.stopPropagation();
    if (scene.isDialogueLocked && scene.dialogueTarget === target) scene.closeDialogue();
    else open();
  });

  scene.addInteractable({ target, verb: 'View', name: promptName(data.title), activate: open });
}

export const BEHAVIORS = {
  painting(scene, view, obj) {
    attachDialogue(scene, view, { title: obj.props.title, description: obj.props.description },
      { pan: obj.props.panOnClick !== false });
  },

  promo(scene, view, obj) {
    attachDialogue(scene, view, {
      title: obj.props.title,
      description: obj.props.body,
      ctaLabel: obj.props.ctaLabel,
      ctaUrl: obj.props.ctaUrl,
    }, { pan: true });
  },

  link(scene, view, obj) {
    const target = view.main;
    const { url, label } = obj.props;
    const activate = () => {
      if (openUrl(url, obj.props.openInNewTab !== false)) return;
      // Popup blocked: show the link in the dialogue with a button the player can click / tap
      scene.openDialogue({ title: label || 'Link', description: url, ctaLabel: 'Open link', ctaUrl: url }, target, { pan: false });
    };
    target.setInteractive({ useHandCursor: true });
    target.on('pointerdown', (pointer, localX, localY, event) => {
      event.stopPropagation();
      activate();
    });
    scene.addInteractable({ target, verb: 'Open', name: promptName(label), activate });
  },

  npc(scene, view, obj) {
    const target = view.main;
    const open = () => scene.openChat(obj, target);
    target.setInteractive({ useHandCursor: true });
    target.on('pointerdown', (pointer, localX, localY, event) => {
      event.stopPropagation();
      open();
    });
    scene.addInteractable({ target, verb: 'Talk', name: promptName(obj.props.name), activate: open });
  },

  portal(scene, view, obj) {
    scene.physics.add.existing(view.main, true); // static body sized to the scaled image
    view.main.body.updateFromGameObject();
    scene.physics.add.overlap(scene.player, view.main, () => scene.travelTo(obj.props.targetScene));
  },
};

export function attachBehavior(scene, view, obj) {
  BEHAVIORS[obj.type]?.(scene, view, obj);
}

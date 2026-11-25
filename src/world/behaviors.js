/**
 * Game-only interactions for world objects (the editor never calls these).
 * Ported from the legacy HubScene / GalleryScene / ArtworkScene.
 */

function openUrl(url, newTab = true) {
  if (!/^https?:\/\//i.test(url || '')) return;
  if (newTab) window.open(url, '_blank', 'noopener');
  else window.location.href = url;
}

/** Hover shows the dialogue; click locks it (and optionally pans the camera to the object). */
function attachDialogue(scene, view, data, { pan }) {
  const target = view.main;
  target.setInteractive({ useHandCursor: true });
  target.on('pointerover', () => {
    if (!scene.isDialogueLocked) scene.showDialogue(data, { placement: scene.dialoguePlacementFor(target.x, target.y) });
  });
  target.on('pointerout', () => { if (!scene.isDialogueLocked) scene.hideDialogue(); });
  target.on('pointerdown', (pointer, localX, localY, event) => {
    event.stopPropagation();
    scene.isDialogueLocked = true;
    if (!pan) {
      scene.showDialogue(data, { placement: scene.dialoguePlacementFor(target.x, target.y) });
      return;
    }
    // Centre the object in the part of the screen the dialogue box leaves visible
    scene.showDialogue(data, { placement: 'bottom' });
    const cam = scene.cameras.main;
    const { edge, size } = scene.dialogue?.getCoverage() ?? { edge: 'bottom', size: 0 };
    const offset = (size / 2 / cam.zoom) * (edge === 'bottom' ? 1 : -1);
    cam.stopFollow();
    cam.pan(target.x, target.y + offset, 500, 'Power2', true);
  });
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
    view.main.setInteractive({ useHandCursor: true });
    view.main.on('pointerdown', (pointer, localX, localY, event) => {
      event.stopPropagation();
      openUrl(obj.props.url, obj.props.openInNewTab !== false);
    });
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

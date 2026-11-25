/**
 * Shared object registry — the single place that knows how each world object type looks.
 * Used by the game (WorldScene) and the admin editor, so what you place is what players see.
 *
 * Each type:
 *   label        human name (editor palette)
 *   icon         emoji for the editor palette / layers list
 *   defaults     initial { size, depth, props } for new objects
 *   fields       inspector form schema (keep in sync with api/lib/validate.js PROP_SPECS)
 *   create(scene, obj) -> view { main, label? }   builds the Phaser objects
 * layout(view, obj) re-positions an existing view after x/y/size/props change (editor drag).
 * Runtime interactions (dialogue, links, portals) live in behaviors.js, not here.
 */
import { textureKey } from './loadWorld.js';

const LABEL_FIELDS = [
  { key: 'label', label: 'Label text', input: 'text' },
  { key: 'labelSize', label: 'Label size', input: 'number', min: 8, max: 96 },
  { key: 'labelOffset', label: 'Label offset (px above)', input: 'number', min: -1000, max: 1000 },
];

const IMAGE_FIELD = { key: 'imageUrl', label: 'Image', input: 'image', required: true };

export const OBJECT_TYPES = {
  painting: {
    label: 'Painting', icon: '🖼️',
    defaults: { size: 160, depth: -1, props: { imageUrl: '', title: 'Untitled', description: '', panOnClick: true } },
    fields: [
      IMAGE_FIELD,
      { key: 'title', label: 'Title', input: 'textarea', rows: 2 },
      { key: 'description', label: 'Description', input: 'textarea', rows: 4 },
      { key: 'panOnClick', label: 'Zoom camera to painting on click', input: 'checkbox' },
    ],
    create: imageWithLabel,
  },
  link: {
    label: 'Link', icon: '🔗',
    defaults: { size: 100, depth: -1, props: { imageUrl: '', url: 'https://', openInNewTab: true, label: 'Visit', labelSize: 18, labelOffset: -80 } },
    fields: [
      IMAGE_FIELD,
      { key: 'url', label: 'Link URL', input: 'url', required: true },
      { key: 'openInNewTab', label: 'Open in new tab', input: 'checkbox' },
      ...LABEL_FIELDS,
    ],
    create: imageWithLabel,
  },
  portal: {
    label: 'Portal', icon: '🌀',
    defaults: { size: 100, depth: 0, props: { imageUrl: 'Portal-Paint.png', targetScene: 'hub', label: 'Portal', labelSize: 24, labelOffset: -60 } },
    fields: [
      IMAGE_FIELD,
      { key: 'targetScene', label: 'Leads to scene', input: 'scene', required: true },
      ...LABEL_FIELDS,
    ],
    create: imageWithLabel,
  },
  promo: {
    label: 'Promo', icon: '📣',
    defaults: { size: 160, depth: -1, props: { imageUrl: '', title: 'New!', body: '', ctaLabel: 'Learn more', ctaUrl: 'https://', startsAt: null, endsAt: null } },
    fields: [
      IMAGE_FIELD,
      { key: 'title', label: 'Title', input: 'text' },
      { key: 'body', label: 'Text', input: 'textarea', rows: 4 },
      { key: 'ctaLabel', label: 'Button label', input: 'text' },
      { key: 'ctaUrl', label: 'Button URL', input: 'url' },
      { key: 'startsAt', label: 'Show from (optional)', input: 'datetime' },
      { key: 'endsAt', label: 'Show until (optional)', input: 'datetime' },
    ],
    create: imageWithLabel,
  },
  text: {
    label: 'Text', icon: '🔤',
    defaults: { size: 100, depth: 0, props: { text: 'Hello!', fontSize: 24, color: '#000000' } },
    fields: [
      { key: 'text', label: 'Text', input: 'textarea', rows: 3, required: true },
      { key: 'fontSize', label: 'Font size', input: 'number', min: 8, max: 200 },
      { key: 'color', label: 'Colour', input: 'color' },
    ],
    create(scene, obj) {
      const main = scene.add.text(obj.x, obj.y, obj.props.text, textStyle(obj.props.fontSize, obj.props.color)).setOrigin(0.5);
      return finish({ main }, obj);
    },
  },
  decor: {
    label: 'Decoration', icon: '🌿',
    defaults: { size: 120, depth: -2, props: { imageUrl: '' } },
    fields: [IMAGE_FIELD],
    create: imageWithLabel,
  },
};

function textStyle(fontSize = 18, color = '#000000') {
  return { fontSize: `${fontSize}px`, color, fontFamily: 'Arial', fontStyle: 'bold', align: 'center' };
}

function imageWithLabel(scene, obj) {
  const key = textureKey(obj.props.imageUrl);
  const main = scene.add.image(obj.x, obj.y, scene.textures.exists(key) ? key : '__MISSING');
  const view = { main };
  if (obj.props.label) {
    view.label = scene.add.text(0, 0, obj.props.label, textStyle(obj.props.labelSize)).setOrigin(0.5);
  }
  return finish(view, obj);
}

function finish(view, obj) {
  layout(view, obj);
  return view;
}

/** Apply position / size / rotation / depth (and label placement) from data to an existing view. */
export function layout(view, obj) {
  const { main } = view;
  main.setPosition(obj.x, obj.y);
  if (main.type === 'Image') {
    const longest = Math.max(main.frame.realWidth, main.frame.realHeight) || 1;
    main.setScale(obj.size / longest);
  } else if (main.type === 'Text') {
    main.setText(obj.props.text);
    main.setStyle(textStyle(obj.props.fontSize, obj.props.color));
  }
  main.setAngle(obj.rotation || 0).setDepth(obj.depth ?? 0);
  if (view.label) {
    view.label.setText(obj.props.label || '');
    view.label.setStyle(textStyle(obj.props.labelSize));
    view.label.setPosition(obj.x, obj.y + (obj.props.labelOffset ?? -60)).setDepth(obj.depth ?? 0);
  }
}

export function createObjectView(scene, obj) {
  const type = OBJECT_TYPES[obj.type];
  if (!type) {
    console.warn(`[world] unknown object type "${obj.type}"`);
    return null;
  }
  return type.create(scene, obj);
}

export function destroyView(view) {
  view?.main?.destroy();
  view?.label?.destroy();
}

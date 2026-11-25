/**
 * The original hardcoded world (from HubScene/GalleryScene/ArtworkScene + ReqworkData/ArtworkData),
 * expressed in the data model. Used once by scripts/seed.js to populate the DB and the fallback JSON.
 * Object ids are deterministic so re-seeding is stable.
 */
import { createHash } from 'node:crypto';

function stableId(name) {
  const h = createHash('sha1').update(`mokis-world:${name}`).digest('hex');
  // Format as an RFC 4122 v5-style UUID.
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const obj = (name, o) => ({ id: stableId(name), rotation: 0, visible: true, ...o });

const label = (text, fontSize, labelOffset) => ({ label: text, labelSize: fontSize, labelOffset });

const april = 150;
const july = 1350;
const requested = [
  ['renaissance', 'RMAC/April2026/Renaissance.jpg', 'Requested by: Ar Win\nRenaissance', 'A beautiful depiction of the rebirth of art and culture.', 250 + april],
  ['safari-drive', 'RMAC/April2026/safari drive.jpg', 'Requested by: Justin David\nSafari Drive', 'An adventurous journey through the wild landscapes of Africa.', 550 + april],
  ['infections', 'RMAC/April2026/infections of a different kind.jpg', 'Requested by: Lennox Valo\nInfections of a Different Kind', 'A captivating piece that explores the complexities of human emotion.', 850 + april],
  ['theres-this-girl', "RMAC/April2026/there's this girl.jpg", "Requested by: Nikko Dullo\nThere's This Girl", 'A heartfelt portrayal of love and longing.', 1150 + april],
  ['say-i-am-you', 'RMAC/July2026/say i am you.jpg', 'Requested by: Nonie R. Pahilga\nSay I Am You', 'An abstract expression of identity and belonging.', 250 + july],
  ['thank-you-blue', 'RMAC/July2026/Thank you blue.jpg', 'Requested by: Ezekiel Ayag\nThank You Blue', 'A soothing composition dominated by calm and melancholy blue tones.', 550 + july],
  ['news-of-the-world', 'RMAC/July2026/news of the world.jpg', 'Requested by: Bao Bao\nNews of the World', 'A fascinating piece depicting the news of the world. Notice the intricate details.', 850 + july],
  ['toho-eurobeat', 'RMAC/July2026/toho eurobeat.jpg', 'Requested by: 绯杳\n a-one records - toho eurobeat vol.6 phantasmagoria of flower view', 'A vibrant and energetic piece inspired by the iconic Toho Eurobeat sound.', 1150 + july],
];

const galleryBase = {
  mode: 'platformer',
  width: 3600,
  height: 900,
  background: { color: '#ffffff' },
  ground: { y: 580, height: 40, color: '#000000' },
};

const returnPortal = (sceneId) =>
  obj(`${sceneId}:portal-hub`, {
    type: 'portal', x: 75, y: 500, size: 100, depth: 0,
    props: { imageUrl: 'Portal-Paint.png', targetScene: 'hub', ...label("Return to Moki's Hub", 16, -50) },
  });

export const legacyWorld = {
  startScene: 'hub',
  scenes: [
    {
      id: 'hub', name: "Moki's Hub", mode: 'topdown', width: 900, height: 900, sort: 0,
      spawn: { x: 400, y: 300 }, background: { color: '#ffffff' }, ground: null,
      objects: [
        obj('hub:facebook', { type: 'link', x: 400, y: 180, size: 100, depth: -1,
          props: { imageUrl: 'Facebook.png', url: 'https://www.facebook.com/yyessa.v', openInNewTab: true, ...label('Follow on Facebook!', 18, -80) } }),
        obj('hub:twitter', { type: 'link', x: 200, y: 180, size: 100, depth: -1,
          props: { imageUrl: 'Twitter.png', url: 'https://twitter.com/ayessamoki', openInNewTab: true, ...label('Follow on Twitter!', 18, -80) } }),
        obj('hub:instagram', { type: 'link', x: 600, y: 180, size: 100, depth: -1,
          props: { imageUrl: 'IG.png', url: 'https://www.instagram.com/ayessamoki', openInNewTab: true, ...label('Follow on Instagram!', 18, -80) } }),
        obj('hub:portal-requested', { type: 'portal', x: 700, y: 400, size: 100, depth: 0,
          props: { imageUrl: 'Portal-Paint.png', targetScene: 'requested', ...label('Requested Art Gallery', 24, -60) } }),
        obj('hub:portal-artwork', { type: 'portal', x: 200, y: 800, size: 100, depth: 0,
          props: { imageUrl: 'Portal-Paint.png', targetScene: 'artwork', ...label('Artwork Showcase', 24, -60) } }),
      ],
    },
    {
      id: 'requested', name: 'Requested Art Gallery', sort: 1, spawn: { x: 170, y: 538 }, ...galleryBase,
      objects: [
        returnPortal('requested'),
        ...requested.map(([slug, imageUrl, title, description, x]) =>
          obj(`requested:${slug}`, { type: 'painting', x, y: 350, size: 160, depth: -1,
            props: { imageUrl, title, description, panOnClick: true } })),
      ],
    },
    {
      id: 'artwork', name: 'Artwork Showcase', sort: 2, spawn: { x: 175, y: 538 }, ...galleryBase,
      objects: [
        returnPortal('artwork'),
        obj('artwork:out-in-the-field', { type: 'painting', x: 250, y: 350, size: 300, depth: -1,
          props: { imageUrl: 'Out in The Field Grass.jpg', title: 'Out in The Field Grass', description: 'Moki Out in the Field of Grass', panOnClick: false } }),
      ],
    },
  ],
};

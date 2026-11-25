# Admin guide

The editor lives at **https://moki-s-world.vercel.app/admin**. Locally, it's at `http://localhost:5173/admin.html` after `npm run dev`.

> Status: complete through Phase 5. Edit, upload images, preview, publish and roll back.

## Signing in
1. Open `/admin` and enter the admin password.
2. You stay signed in on that browser for 7 days. **Sign out** (top right) ends the session.
3. Changing the password in Vercel signs everyone out.

## The screen
| Area | What it does |
|---|---|
| **Top bar** | See the table below |
| **Left panel** | **Add to scene** palette; the **Objects** list (top-most layer first, click to select); **Scene settings** (click to expand) |
| **Map** | The scene exactly as players see it, plus guides: a grid with a line every 50 px, the purple scene border, the ground, and a draggable **Player start** |
| **Right panel** | The **Inspector**: everything about the selected object, editable, with **Duplicate** and **Delete** buttons |

**Top bar, left to right:**
- **Scene picker** and **＋ New scene**
- **↶ Undo** and **↷ Redo**
- **Zoom:** − / % / +. Click the % to fit the whole scene.
- **Snap:** positions snap to a 10 px grid.
- **Save status:** "All changes saved" / "Saving…" / "⚠ Not saved"
- **Live status:** "Live: version N", or "Unpublished changes". Click it to open the live site.
- **History:** past versions and rollback
- **Preview ▶:** play your draft
- **Publish:** make your changes live
- **Sign out**

## Everyday tasks
### Add something
**Click** an item in *Add to scene* to place it in the middle of your view, or **drag** it onto the map exactly where you want it. The new object is selected so you can fill in its details right away.

| Type | Use it for |
|---|---|
| 🖼️ **Painting** | Artwork. Hovering shows the title and description; clicking can zoom the camera to it |
| 🔗 **Link** | A clickable image that opens a website, such as a social profile or a shop |
| 🌀 **Portal** | Walking into it takes the player to another scene |
| 📣 **Promo** | A clickable image with a title, text and a button (for example "Buy now"). It can be shown only between two dates |
| 🔤 **Text** | A sign or heading |
| 🌿 **Decoration** | A non-interactive image |
| 💬 **NPC (chat)** | A character players can talk to. Write its **Persona** (who it is and how it talks; this is public, so no secrets) and list **Reference URLs** it should know about. Its live tools only work on those sites. After placing it, fill its knowledge pack (studio CLI, or `POST /api/admin/npc-knowledge/:id`) and **publish**. Players can only chat with published NPCs. See `docs/NPC.md` |

New objects start with a grey placeholder image. Click **Choose image…** to replace it.

### Images
**Choose image…** (next to any Image field, and *Background image* in Scene settings) opens the image picker:
- **Upload from your computer.** Click the box or drop files onto it. PNG, JPG, WebP and GIF images up to 10 MB are accepted, and you can upload several at once. Very large images are shrunk to 2560 px on the longest side, so the game stays fast on phones.
- **Your uploads.** Everything you've uploaded, newest first.
- **Already in your world.** Images the site already uses, such as the social icons and paintings.

Click an image, then **Use image**, or just double-click it. You can still paste any `https://` image address into the field yourself.

### Move, resize and arrange
- **Move:** drag the object. With **Snap** on, it lines up to a 10 px grid.
- **Nudge:** arrow keys move 1 px; **Shift + arrow** moves 10 px.
- **Resize:** drag the small white square at the bottom-right corner of the selection, or type a **Size**, which is the longest side in pixels.
- **In front or behind:** change **Layer**. Higher numbers are drawn on top. Players are on layer 0.
- **Hide without deleting:** untick **Visible to players**. Hidden objects look faded in the editor and are crossed out in the list.

### Edit details
Select an object and type in the Inspector. Everything saves on its own; watch the save status in the top bar. Links must be full addresses starting with `https://`, and a hint appears under the field until the address is complete.

### Undo mistakes
**Ctrl+Z** undoes and **Ctrl+Shift+Z** (or **Ctrl+Y**) redoes. Typing in one field counts as a single step, and so does a single drag. Deleted objects come back exactly as they were.

### Scenes
- **New scene:** click ＋ next to the scene picker. Choose a **Side-scroller gallery** (walk and jump, with a ground line) or a **Top-down room** (walk in all directions). A portal back to the hub is added for you. Then add a **Portal** in the hub (or any scene) that leads to the new scene, so players can find it.
- **Scene settings:** name, type, size, player start, background colour and ground (for side-scrollers). Changes save when you leave a field. You can also drag the **Player start** marker on the map.
- **Delete a scene:** use the button at the bottom of Scene settings. The hub can't be deleted, and neither can a scene that portals still lead to; remove those portals first.

## Keyboard shortcuts
| Keys | Action |
|---|---|
| Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | Undo / redo / redo |
| Delete or Backspace | Delete the selected object |
| Ctrl+D | Duplicate the selected object |
| Arrow keys (Shift = 10 px) | Nudge the selected object |
| F | Fit the scene to the screen |
| Esc | Deselect |
| Mouse wheel / drag empty space / right-drag | Zoom / pan / pan |

## Draft, preview, publish
Everything you change is saved to the **draft**. Players keep seeing the last **published** version until you publish.

1. **Preview ▶** opens the game in a new tab with your draft. An orange banner reminds you it's a preview, and only you can see it while you're signed in.
2. **Publish** shows what will go live. Add an optional note, such as "Added July requests", and press **Publish now**. Visitors see the new version within about a minute. The button is greyed out when there's nothing new to publish.
3. **History** lists every published version with its date, note and size. **Restore** copies an old version into your draft and replaces your unpublished changes. Check it, then **Publish** to make it live again. This is how you roll back a mistake.

# Admin guide

The editor lives at **`/admin.html`** on the site (locally: `http://localhost:5173/admin.html` after `npm run dev`).

> Status: Phase 3. You can sign in, browse every scene and inspect objects. Editing (Phase 4) and uploading and publishing (Phase 5) come next.

## Signing in
1. Open `/admin.html` and enter the admin password.
2. You stay signed in on that browser for 7 days. **Sign out** (top right) ends the session.
3. Changing the password in Vercel signs everyone out.

## Finding your way around
| Area | What it shows |
|---|---|
| **Top bar** | The scene picker (scene name plus object count), zoom (− / % / +; click the % to fit the scene), the **Live: version N** status, **View site ↗** and **Sign out** |
| **Left panel** | Scene details: name, type, size, player start. Below them, the **Objects** list, top-most layer first. Click an object to select it |
| **Map** | The scene exactly as players see it, plus editor guides: a grid with a line every 50 px, the purple scene border, the ground line and a **Player start** marker |
| **Right panel** | The **Inspector** for the selected object: position, size, layer, visibility, and its type's details such as image, title, link and destination |

## Map controls
| Action | How |
|---|---|
| Zoom | Mouse wheel, or the − / + buttons |
| Fit whole scene | Click the % button, or press **F** |
| Pan | Drag empty space, or right/middle-drag anywhere |
| Select | Click an object on the map or in the list |
| Deselect | Click empty space, or press **Esc** |

## Coming next
1. **Add an object.** Click or drag an item from the *Add* palette: Painting, Link, Portal, Promo, Text or Decor.
2. **Move and resize it.** Drag the object on the map, and drag the corner handle to resize it. Arrow keys nudge it, Delete removes it and Ctrl+D duplicates it.
3. **Edit its details in the inspector.** Changes save automatically.
4. **Preview your changes.** *Preview as player* shows the draft without making it public.
5. **Publish.** Changes only go live when you press **Publish**. Use *Versions* to roll back.

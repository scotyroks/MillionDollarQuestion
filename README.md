# 💰 Who Wants to Be a Millionaire — Game Night

A two-screen controller for hosting your own *Who Wants to Be a Millionaire* night.
One screen faces the **host** (control panel), the other faces the **contestant /
the room** (the big dramatic display). State syncs live between them.

**Zero dependencies.** Pure Node.js — nothing to install.

---

## Quick start

1. Make sure you have **Node.js 16+** installed.
2. From this folder, run:

   ```bash
   node server.js
   ```

3. The terminal prints two URLs, for example:

   ```
   Host screen     : http://192.168.1.20:3000/host
   Contestant view : http://192.168.1.20:3000/display
   ```

4. Open **`/host`** on the device you control (laptop/phone).
5. Open **`/display`** on the contestant's screen (a TV, tablet, or second laptop).

> Both devices must be on the **same Wi-Fi / network**. Use the `http://192.168…`
> address shown in the terminal, not `localhost`, when opening on a second device.

To use a different port: `PORT=8080 node server.js`.

---

## Running the show (host screen)

- **Start Game** — shows the play area on the contestant screen.
- **Reveal Question** → **Reveal Answers** — stage the dramatic reveal.
- **Click an answer** — highlights it orange as the contestant's choice.
- **🔒 Lock In** — locks the choice (pulsing) with a suspense sound.
- **Reveal Answer** — flips it green if correct, and shows a win/lose overlay.
- **Walk Away** — the contestant takes their guaranteed money.
- **Next ▶ / ◀ Prev** — move through the prize ladder.
- **Reset** — start over from $100.

### Lifelines
- **50:50** — removes two wrong answers on both screens.
- **☎ Phone a Friend** — launches a 30-second countdown on the contestant screen.
- **👥 Ask the Audience** — shows a bar chart. Hit **auto** for realistic
  audience numbers, or type your own percentages and hit **apply**.

### Editing questions
Click **Edit Questions ✎** on the host screen to add, edit, reorder by saving,
or delete questions live. Pick the correct answer with the radio button.
Changes are saved to `questions.json` and persist between runs.

---

## How it works

| Part | Detail |
|------|--------|
| Server | `server.js` — pure Node `http`, holds game state |
| Sync | Server-Sent Events (`/events`) push state; host posts to `/action` |
| Host UI | `public/host.html` + `host.js` |
| Display UI | `public/display.html` + `display.js` |
| Audio | Synthesized via Web Audio (`common.js`) — no copyrighted files |
| Questions | `questions.json` (auto-created from a built-in sample set) |

The prize ladder is the classic 15-step ladder with safe havens at
**$1,000** and **$32,000**.

---

Have a great game night! 🎉

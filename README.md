# 💰 Million Dollar Question — Game Night

A two-screen controller for hosting your own *Million Dollar Question* trivia night.
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

### Adding the logo
Save your logo image as **`public/logo.png`** and it appears automatically on
the intro screen, the corner during play, and the host panel. Until you add it,
a styled gold-and-emerald text version of the title is shown instead. (PNG, JPG,
and WebP all work — keep the name `logo.png`.)

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
- **👥 Ask the Audience** — three ways to run it:
  - **auto** — realistic computer-generated numbers.
  - **manual** — type your own percentages and hit **apply**.
  - **📱 live phone vote** — the audience votes from their own phones (below).

### 📱 Live audience voting (phones)
Let everyone in the room vote on their phones for *Ask the Audience*:

1. Have the audience open **`http://<your-ip>:3000/vote`** (same Wi-Fi). The
   exact address is printed in the terminal when the server starts.
2. On the host screen, under **Live audience vote**, click **Open Live Vote**.
3. Phones light up with A/B/C/D buttons — everyone taps their answer. (Tapping
   again changes a vote; each phone counts once.) The contestant's chart fills
   in **live** as votes arrive, and the host sees a running tally.
4. Click **Close & Lock** to freeze the final result on the big screen.

The voting page only ever receives the question and answer options — **the
correct answer is never sent to anyone's phone.**

### 🪑 Hot seat (multiple players)
Run it as a rotating hot-seat game:

1. In the **Hot Seat & Players** panel on the host screen, add each player's
   name in turn order.
2. The first player is in the hot seat — their name shows on the contestant
   screen. It's a single shared prize ladder.
3. If the current player is unsure, hit **⏭ Skip → Next Player**. The hot seat
   passes to the next person, who takes on the **same question at the same
   prize level**. The answer attempt resets so they can lock in their own choice.
4. You can also jump the seat to anyone with **set seat**, or remove a player
   with **✕**. The roster survives **Reset**, so you can replay with the same group.

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
| Audience phones | `public/vote.html` polls the sanitised `/poll` endpoint |
| Audio | Synthesized via Web Audio (`common.js`) — no copyrighted files |
| Questions | `questions.json` (auto-created from a built-in sample set) |

The prize ladder is the classic 15-step ladder with safe havens at
**$1,000** and **$32,000**.

---

Have a great game night! 🎉

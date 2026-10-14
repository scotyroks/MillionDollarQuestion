# 💰 Million Dollar Question — Game Night

Host your own *Million Dollar Question* trivia night. One device is the **host
control panel**, a TV or laptop is the **big screen** for the room, and the
audience can **vote from their phones** when the contestant asks the audience.
Everything stays in sync live.

**Zero dependencies.** Pure Node.js, so there's nothing to install.

---

## Quick start

1. Install **Node.js 18 or newer**.
2. From this folder, run:

   ```bash
   npm start        # or: node server.js
   ```

3. The terminal prints your links:

   ```
   Host controls   : http://192.168.1.20:3000/host?key=k7m2qp
   Big screen      : http://192.168.1.20:3000/display
   Audience phones : http://192.168.1.20:3000/vote
   ```

4. Open the **Host controls** link on the device you'll run the game from.
5. Open **Big screen** on the TV / second screen. Click it once to turn on
   sound, and press **F** (or double-click) for fullscreen.

> Every device must be on the **same Wi-Fi**. Use the `http://192.168…`
> addresses, not `localhost`, on other devices.

Other settings: `PORT=8080 npm start` changes the port, and
`HOST_KEY=mysecret npm start` sets your own host key.

### The host key
Anyone on the Wi-Fi can open the big screen and the voting page, but only a
device with the **host key** can run the game. The key is the end of the
*Host controls* link. It's generated once and saved in `.host-key`. The host
page remembers it after the first visit, and on the computer running the server
you can just open `http://localhost:3000/host`.

### Adding your logo
Save your logo as **`public/logo.png`** and it shows on the intro screen, in the
corner during play, and on the host panel. Until then a gold-and-emerald text
logo is shown.

---

## Running the show

The host panel highlights the **next button to press** and gives a one-line
hint, so you can follow along even on your first game.

| Step | Button | Key |
|------|--------|-----|
| Start the round | **Start Game** | |
| Show the question | **Reveal Question** | `Q` |
| Show answers one at a time | **Reveal Answer A → D** | `Space` |
| Show every answer at once | **Reveal All** | `A` |
| Highlight the contestant's pick | click an answer | `1`–`4` |
| "Is that your final answer?" | **🔒 Lock In** (or **Unlock**) | `L` / `U` |
| Dramatic pause, then green or red | **Reveal Answer** | `Enter` |
| Climb the ladder | **Next Question** | `N` (`P` goes back) |
| Take the money | **Walk Away** | `W` |
| Pass the hot seat on | **Next Player** | `S` |
| Clear overlays from the big screen | **Clear Overlay** | `Esc` |

Press `?` on the host panel to see the shortcuts. You can click any rung of
the prize ladder to jump to that question.

**Prize ladder.** The classic 15 steps, with safe havens at **$1,000** and
**$32,000**. A wrong answer drops to the last safe haven you've passed, and
walking away keeps the last amount won. If your question bank has fewer than
15 questions, the game uses the top of the ladder, so the last question is
always worth $1,000,000.

### Lifelines (one of each per round)
- **50:50**: removes two wrong answers on every screen.
- **☎ Phone a Friend**: a 30, 45 or 60-second countdown on the big screen and
  host panel. It closes by itself when time runs out.
- **👥 Ask the Audience**, three ways:
  1. **Live phone vote** (recommended): press **Open Voting**. The big screen
     shows a **QR code** and the link. Phones show the question and A–D
     buttons, and the chart fills in live as votes arrive. Each phone gets one
     vote and can change it. Press **Close & Lock** to freeze the result.
  2. **Auto-generate**: believable numbers that lean towards the right
     answer, more confidently on the easier questions.
  3. **Enter your own %**: type the numbers in.

Phones only ever receive the question and options, **never the correct
answer**. The big screen only gets the correct answer when the reveal plays.

### 🪑 Hot seat (several players)
Add players in turn order on the host panel. Their name shows on the big
screen. **Next Player** passes the seat to the next person, who faces the
**same question at the same prize level**. Reorder with ↑ ↓, put anyone in the
seat with **seat**, or remove them with ✕. Players stay through new rounds.

### Editing questions
The **Question Bank** panel lets you add, edit, delete and reorder questions
(↑ easier / ↓ harder), and tick the correct answer. **🔀 Shuffle answers**
mixes up the A–D order. Changes save to `questions.json` straight away.

- **Export** downloads your bank as JSON to back it up or share it.
- **Import** loads a JSON export, or a CSV with the columns
  `question, A, B, C, D, correct` (the correct answer as a letter). A header row
  is optional. You can replace the bank or add to the end of it.
- **Restore samples** brings back the 15 built-in questions.

Only the first 15 questions are played. Any extras are kept as spares.

---

## How it works

| Part | Detail |
|------|--------|
| `server.js` | Pure Node `http` server: routes, host key, live streams |
| `lib/game.js` | The game rules as a state machine, plus what each screen is allowed to see |
| `lib/questions.js` | Sample questions, validation, saving |
| `lib/qr.js` | Tiny QR-code generator for the voting link |
| Sync | Server-Sent Events: `/events?role=host|display|audience`, each filtered for that screen |
| Host actions | `POST /action` (needs the host key) |
| Phone votes | `POST /vote` (can only cast a vote) |
| Audio | Synthesised with Web Audio (`public/common.js`), so no sound files are needed |

### Development

```bash
npm test         # runs the test suite (node:test, no installs)
npm run dev      # restarts the server when files change
```

---

Have a great game night! 🎉

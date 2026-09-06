# Fastshot Portfolio — AI Chatbot Spec

> **Stack:** React + Vite `src/App.jsx` · Firebase Firestore `my-project-3afa4` · OpenRouter Free `minimax/minimax-m3:free` · Offline fallback `buildFallbackAnswer`

---

## 1. What the chatbot should do

### Role
You are **Fastshot portfolio assistant for Daksh Patil — Full-stack Product Engineer**. You live on the landing hero as a **chat-first** UI (welcome + chips + input). You answer **from portfolio data first**, then help generally.

### Core jobs
1. **Answer from portfolio** — projects, skills, bio/about, contact, location/availability, links, photos.
2. **Stay concise & friendly** — 1-4 sentences, bold for key entities, plain text + simple `**bold**`.
3. **Guide** — suggest follow-ups: “Name a project for details” / “Try: What projects do you have?”
4. **Fallback gracefully** — if OpenRouter `401/empty` or offline → use local `buildFallbackAnswer` (no scary stack trace), show `✅ Free model active (offline portfolio)` with `Set key` CTA.
5. **Never hallucinate** — if data missing → `No projects yet — add them from hidden admin editor.` / `Location not set.`
6. **Be safe** — no disallowed content, no prompt injection, sanitize URLs, no secrets.

### What it must NOT do
- Invent projects, skills, or contact details not in Firestore/DEF.
- Expose `adminPin`, `IMGBB_KEY`, or raw `localStorage`.
- Send attachments to AI (demo toast only).
- Block on `thinking…` — always remove typing indicator on success/failure.

---

## 2. Where it goes for data (priority order)

### 2.1 System prompt `buildSystemPrompt()` `src/App.jsx:591`
Built on every request from live React state:

```
You are Fastshot portfolio assistant for {name} — {role}.
Tagline: {tagline}
About: {about}
Skills: {skills}
Contact: email={email}, phone={phone}, location={location}, availability={availability}, github={github}, linkedin={linkedin}
Projects:
- {title}: {blurb} [{tags}] {link}
- ...
Be concise, friendly, answer from this context first. If outside scope, politely say you specialize in portfolio but can still help generally. Use plain text, you may use simple markdown bold. No disallowed content.
```

| Data | Source | Key / Doc |
|------|--------|-----------|
| **Profile** `name, role, tagline, about, skills, email, phone, location, availability, github, linkedin, avatarUrl, photoUrl, brandName, logoUrl, adminPin` | Firestore `portfolio/content` → `docToContent()` → `localStorage fs_portfolio_v1` → `DEF` fallback | `E:\...\src\App.jsx:231` `DEF` `src/App.jsx:30` |
| **Projects** `title, blurb, tags, link, image, order` | Firestore `projects` collection `snapToProject()` → `localStorage` → `SAMPLE_PROJECTS` fallback | `src/App.jsx:238` |
| **Inbox / Messages** | Firestore `messages` `orderBy(createdAt desc) limit 50` (read only in Admin) | `src/App.jsx:515` |
| **Questions log** | Firestore `questions` `{q, createdAt}` on every user submit (best effort) | `src/App.jsx:642` |
| **Images** | **NOT for chat** — `ImgBB` `https://api.imgbb.com/1/upload?key=IMGBB_KEY` → link stored in Firestore, `sanitizeUrl()` checks `http/https/data:image` | `src/App.jsx:205` |
| **Cache** | `localStorage fs_portfolio_v1` `{content, projects}` — survives offline, seeded from `DEF + SAMPLE_PROJECTS` | `src/App.jsx:298` |
| **Chat history** | `chatHistoryRef` last 16 turns `[{role, content}]` + system prompt, last 6 injected | `src/App.jsx:596` |

### 2.2 Data flow

```
Firestore (portfolio/content, projects) ──onSnapshot/getDoc──> React state (content, projects) ──saveCache──> localStorage
                                                              │
                                                              └─> buildSystemPrompt() ──> OpenRouter (minimax-m3:free) ──> mdToHtml → chat
                                                              │
                                                              └─> buildFallbackAnswer() (offline, no network 401)
```

**Offline:** `getOpenRouterKey()` returns revoked → `FREE_OFFLINE` throw → `buildFallbackAnswer` uses `norm/tokens/has` + exact `title` match + scored `title+blurb+tags` → returns `Fallback + ✅ Free model active (offline portfolio)` `src/App.jsx:659`.

---

## 3. How it answers (routing)

`buildFallbackAnswer(qRaw, content, projects)` `src/App.jsx:130`:

| User intent | Keywords `has(q, [...])` | Data used |
|-------------|---------------------------|-----------|
| Greeting | `/^(hi|hey|hello|yo|sup|good ...)/` | `name` |
| Exact project | `tokens(title)` overlap ≥50% | `projects` hit → `title+blurb+tags+link` |
| Projects list | `project, work, portfolio, built, case, showcase` | `projects.length + map title` |
| Skills | `skill, stack, tech, tools, framework` | `content.skills` |
| About/bio | `about, bio, background, story, who` | `name+role+about` |
| Name | `name, who is` | `name+role+tagline` |
| Contact | `contact, email, phone, reach, message` | `email+phone+location` |
| Location | `where, location, based, remote` | `location` |
| Availability | `available, hire, freelance, rate, pricing` | `availability+email` |
| Links | `github, linkedin, social, resume` | `github+linkedin` |
| Photos | `photo, avatar, image` | static ImgBB explanation |
| Help | `help, what can you` | static Fastshot explanation |
| Scored fallback | `tokens` overlap | `title+blurb+tags` scored sort |

Live AI (`callOpenRouter`) uses same `buildSystemPrompt` + `chatHistory` (last 6) with `temperature 0.7, max_tokens 700` `src/App.jsx:596`.

---

## 4. Free model & key handling

- **Model:** `minimax/minimax-m3:free` `OPENROUTER_MODEL` `src/App.jsx:91`
- **Endpoint:** `https://openrouter.ai/api/v1/chat/completions`
- **Key:** `OPENROUTER_KEY_DEFAULT = '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'` valid (tested `200 Hello!`). Old `85e58ec...` revoked → `isKeyRevoked()` `src/App.jsx:95`.
- **Storage:** `localStorage.openrouter_key` overrides default. `getOpenRouterKey()` ignores revoked stored key and returns default. UI: `OpenRouter · Free • live/offline` button `src/App.jsx:1001` opens `showKeyDialog` → save to `localStorage` or `Use offline`.
- **No 401 noise:** If `isKeyRevoked` or `401` → throw `FREE_OFFLINE` → catch shows portfolio answer + `✅ Free model active (offline)` with link to `openrouter.ai/keys` `src/App.jsx:659`, no `Failed to load resource: 401` in console (fetch skipped).

---

## 5. UI / UX

- **Hero chat-first** `src/App.jsx:889` `hero flex-start` + `chat-out on` `220px/42vh` glass `rgba(24,24,27,.55)` + suggestion chips `What projects… / Show your skills…` that submit directly.
- **Welcome** `useEffect` on mount `src/App.jsx:665` → `Hi — I'm Fastshot assistant for Daksh Patil...`
- **Typing** `typing-dots` animation, `busy` disables `send`, `scrollTop` on `chatOutRef`.
- **Mobile** `src/App.css:594` `@media (max-width:599px)` `hero` + `#chatOut 180px/50vh` + `.tag 44px` + `.ask 16px` (no iOS zoom).

---

## 6. Security & sanitization

- `sanitizeUrl(u)` `src/App.jsx:99` allows only `http/https/data:image`, used for `logoUrl, avatarUrl, photoUrl, image, link, github, linkedin` before render.
- `esc()` + `mdToHtml()` escapes HTML then re-adds `<b>` and `<a>` for links.
- `toB64` + `imgbb` 8MB limit.
- `adminPin` plaintext in Firestore (demo) — use strong unique, not reused.

---

## 7. Admin & data editing (where chatbot data comes from)

- **Hidden admin:** `Admin (locked)` always visible `src/App.jsx:776`, `handleOpenAdmin` → `lock` → `1234` (default `DEF.adminPin`) → `adminOn`. Also `admin` typed anywhere (outside inputs) or `phone` field `tryPin` `src/App.jsx:549`.
- **Tabs:** `Profile & photos` → `adminForm` → `setDoc(portfolio/content)`; `Projects` → `addDoc/setDoc(projects)`; `Inbox` → `query(messages)`.
- **After save:** `docToContent` → `setContent` → `saveCache` → `buildSystemPrompt` on next chat uses new data instantly.

---

## 8. Example

**Q:** `What projects do you have?` → `has` `project` → `projects.length` → `• Ledgerly …` → or via live AI system prompt containing `Ledgerly: ...` → `minimax` returns `Based on my records … Ledgerly — finance tracker`.

**Q:** `Show your skills` → `Toolkit` → `content.skills`.

**Q:** `How to reach you?` → `Email + Phone + Location` + `Contact tab` note.

---

## 9. File map

| File | Role |
|------|------|
| `index.html` | `favicon data-uri` + `#root` |
| `src/main.jsx` | `ReactDOM.createRoot` |
| `src/App.jsx` | all chatbot + portfolio logic |
| `src/App.css` | tokens `1560×1008`, `chat-out`, mobile |
| `vite.config.js` | `@vitejs/plugin-react` |
| `public/favicon.*` | `200` for `/favicon.ico` |

Run `npm run dev` (`5173`) / `npm run build` → `dist/`.

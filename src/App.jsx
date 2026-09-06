import { useEffect, useState, useRef, useCallback } from 'react'
import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  doc,
  collection,
  onSnapshot,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

// ---------- constants ----------
const IMGBB_KEY = '2174caf7a453c208b2d99b564ba7357e'
const FB = {
  apiKey: 'AIzaSyDvpPBa_hnDtezuX8n9lDOp9I-pVI8dQsY',
  authDomain: 'my-project-3afa4.firebaseapp.com',
  projectId: 'my-project-3afa4',
  storageBucket: 'my-project-3afa4.firebasestorage.app',
  messagingSenderId: '327244045064',
  appId: '1:327244045064:web:c6b9fa41678ad6ae8daabd',
  measurementId: 'G-Z156EK224N',
}
const DEF = {
  brandName: 'Fastshot Studio',
  logoUrl: '',
  name: 'Aarav Mehta',
  role: 'Full-stack Product Engineer',
  tagline: 'I turn written ideas into working apps, end to end.',
  about:
    'I am a full-stack product engineer with eight years of experience shipping web and mobile software. I work across the whole stack — interface design, front-end architecture, APIs, and data — and I like products that feel fast and obvious.\n\nMost recently I led the rebuild of a fintech dashboard used by 40,000 monthly customers, cutting load times by 68% and lifting activation by a third. Before that I shipped design systems and internal tools at scale-up companies.\n\nOutside of client work I build small tools with AI, teach a weekend workshop on prototyping, and write about interface performance.',
  skills: 'Product design, React, TypeScript, Next.js, Node, Firebase, PostgreSQL, Motion, Figma, Testing',
  email: 'hello@fastshot.studio',
  phone: '+1 415 555 0134',
  location: 'Bengaluru, India · Remote worldwide',
  availability: 'Taking two new projects for this quarter',
  github: 'https://github.com',
  linkedin: 'https://linkedin.com',
  avatarUrl: '',
  photoUrl: '',
  adminPin: '1234',
}
const SAMPLE_PROJECTS = [
  {
    title: 'Ledgerly',
    order: 1,
    tags: 'React, TypeScript, Plaid API, Firebase',
    blurb:
      'A privacy-first personal finance tracker that pulls bank data, auto-categorises spending and forecasts cash flow. 40k monthly users.',
    link: 'https://example.com/ledgerly',
    image: '',
  },
  {
    title: 'Nimbus Docs',
    order: 2,
    tags: 'Next.js, Markdown, Edge functions',
    blurb:
      'A collaborative documentation platform with real-time multiplayer editing, version history and instant search across 100k documents.',
    link: 'https://example.com/nimbus',
    image: '',
  },
  {
    title: 'Fieldkit',
    order: 3,
    tags: 'React Native, Maps, Offline-first',
    blurb:
      'An offline-first field-survey app for conservation teams — GPS traces, photo evidence and sync when a connection reappears.',
    link: 'https://example.com/fieldkit',
    image: '',
  },
  {
    title: 'Pulse Analytics',
    order: 4,
    tags: 'D3, Node, BigQuery',
    blurb:
      'A real-time analytics console that streams 2 million events a day into live dashboards and anomaly alerts for growth teams.',
    link: 'https://example.com/pulse',
    image: '',
  },
]
const OPENROUTER_KEY_DEFAULT = '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'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_MODEL = 'minimax/minimax-m3:free'
const isKeyRevoked = (k) => String(k).includes('85e58ec88b3f913480fb24e28ea271f638ea772beff385dd1bec3f5236426ee8')
const getOpenRouterKey = () => {
  try {
    const k = localStorage.getItem('openrouter_key')
    if (k && k.trim()) {
      if (isKeyRevoked(k.trim())) { try { localStorage.removeItem('openrouter_key') } catch {}; return OPENROUTER_KEY_DEFAULT }
      return k.trim()
    }
    return OPENROUTER_KEY_DEFAULT
  } catch { return OPENROUTER_KEY_DEFAULT }
}
const CACHE_KEY = 'fs_portfolio_v1'
const PH_TEXT = 'Build a fintech tracking app with bank level privacy and...'

// ---------- utils ----------
function sanitizeUrl(u) {
  try {
    const s = String(u || '').trim()
    if (!s) return ''
    if (s.startsWith('data:image/')) return s
    const url = new URL(s, window.location.href)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
    return ''
  } catch {
    return ''
  }
}
function esc(s) {
  return String(s == null ? '' : s)
}
function initials(n) {
  return esc(n)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || 'FS'
}
function norm(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim()
}
function tokens(s) {
  return norm(s).split(' ').filter((w) => w.length > 1)
}
function has(q, words) {
  return words.some((w) => q.split(' ').indexOf(w) > -1 || q.indexOf(w) > -1)
}
function buildFallbackAnswer(qRaw, content, projects) {
  const q = norm(qRaw)
  const t = tokens(qRaw)
  const projs = [...projects].sort((a, b) => a.order - b.order)
  const name = esc(content.name)
  const role = esc(content.role)
  if (!q) return `Ask me anything about ${name}.`
  if (/^(hi|hey|hello|yo|sup|good (morning|afternoon|evening))\b/.test(q))
    return `Hey! I am the assistant for ${name}'s portfolio. Ask me about projects, skills, background or how to get in touch.`
  let hit = null
  projs.forEach((p) => {
    const pt = tokens(p.title)
    if (!pt.length) return
    const m = pt.filter((w) => q.indexOf(w) > -1).length
    if (m >= 1 && m / Math.max(1, pt.length) >= 0.5) hit = p
  })
  if (hit) {
    let r = `<b>${esc(hit.title)}</b>`
    if (hit.blurb) r += `<br>${esc(hit.blurb)}`
    if (hit.tags) r += `<br><span class="muted">${esc(hit.tags)}</span>`
    if (hit.link) r += `<br><span class="muted">Link: ${esc(hit.link)}</span>`
    return r
  }
  if (has(q, ['project', 'work', 'portfolio', 'built', 'build', 'case', 'study', 'showcase', 'apps', 'things']))
    return projs.length
      ? `<b>${projs.length} projects</b> on file:<br>${projs.map((p) => `• ${esc(p.title)}`).join('<br>')}<br><span class="muted">Name any of them for details.</span>`
      : 'No projects are saved yet. Add them from the hidden admin editor.'
  if (has(q, ['skill', 'skills', 'stack', 'tech', 'technology', 'tools', 'language', 'languages', 'framework', 'expertise']))
    return `<b>Toolkit</b><br>${esc(content.skills)}`
  if (has(q, ['about', 'bio', 'background', 'story', 'who', 'yourself', 'experience', 'career', 'history']))
    return `<b>${name} — ${role}</b><br>${esc(content.about)}`
  if (has(q, ['name', 'who is'])) return `This is <b>${name}</b>, ${role}. ${esc(content.tagline)}`
  if (has(q, ['contact', 'email', 'mail', 'reach', 'touch', 'phone', 'call', 'number', 'message', 'talk', 'chat', 'connect']))
    return `<b>How to reach ${name}</b><br>Email: ${esc(content.email)}${content.phone ? `<br>Phone: ${esc(content.phone)}` : ''}${content.location ? `<br>Location: ${esc(content.location)}` : ''}<br><span class="muted">The Contact tab has a form that writes straight to Firestore.</span>`
  if (has(q, ['where', 'location', 'based', 'live', 'remote'])) return esc(content.location || 'Location not set.')
  if (has(q, ['available', 'availability', 'hire', 'hiring', 'freelance', 'open to', 'rate', 'pricing', 'cost', 'quote']))
    return `<b>Availability</b><br>${esc(content.availability || 'Open to select projects')}<br><span class="muted">For scope and pricing, email ${esc(content.email)}.</span>`
  if (has(q, ['github', 'linkedin', 'social', 'link', 'links', 'site', 'website', 'resume', 'cv']))
    return `<b>Links</b><br>${content.github ? `GitHub: ${esc(content.github)}<br>` : ''}${content.linkedin ? `LinkedIn: ${esc(content.linkedin)}<br>` : ''}<span class="muted">Links are editable in the admin editor.</span>`
  if (has(q, ['photo', 'picture', 'avatar', 'image', 'pic']))
    return 'Photos are uploaded to ImgBB and stored as links in Firestore — one small avatar on the main page and one larger photo on the About tab.'
  if (has(q, ['help', 'what can you', 'how does', 'what is this', 'who made']))
    return 'This page is a Fastshot-style portfolio. I answer from the data saved in Cloud Firestore: profile, skills, projects, photos and contact details.'
  if (t.length) {
    const scored = projs
      .map((p) => {
        const pt = tokens(`${p.title} ${p.blurb} ${p.tags}`)
        const s = t.filter((w) => pt.indexOf(w) > -1).length
        return [s, p]
      })
      .filter((x) => x[0] > 0)
      .sort((a, b) => b[0] - a[0])
    if (scored.length)
      return `Closest match: <b>${esc(scored[0][1].title)}</b><br>${esc(scored[0][1].blurb || '')}<br><span class="muted">Try naming a project, or ask about skills, background or contact.</span>`
  }
  return 'I can answer from the portfolio data: <b>projects</b>, <b>skills</b>, <b>background</b>, <b>photos</b> and <b>contact</b>. Try “what projects are you most proud of?” or “how can I reach you?”'
}
function mdToHtml(s) {
  let html = esc(s)
  html = html.replace(/\n/g, '<br>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  html = html.replace(/\*(.+?)\*/g, '<b>$1</b>')
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:var(--accent-2);word-break:break-all;">$1</a>')
  return html
}
function toB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).split(',')[1])
    r.onerror = rej
    r.readAsDataURL(file)
  })
}
async function imgbb(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('Image too large (max 8MB)')
  const b64 = await toB64(file)
  const fd = new FormData()
  fd.append('image', b64)
  const r = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: 'POST', body: fd })
  const j = await r.json()
  if (!j || !j.data || !j.data.url) throw new Error('ImgBB upload failed')
  return j.data.url
}

// ---------- Firebase setup (FirestoreSettings.cache - no deprecated enableIndexedDbPersistence) ----------
let db = null
let fbOk = false
try {
  const app = initializeApp(FB)
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch {
    db = getFirestore(app)
  }
  fbOk = true
} catch {
  fbOk = false
}

function docToContent(s) {
  const o = { ...DEF }
  ;['name','role','tagline','about','skills','email','phone','location','availability','github','linkedin','avatarUrl','photoUrl','adminPin','brandName','logoUrl'].forEach((k) => {
    if (typeof s[k] === 'string') o[k] = s[k]
  })
  return o
}
function snapToProject(id, s) {
  return { id, title: s.title || 'Untitled', blurb: s.blurb || '', tags: s.tags || '', link: s.link || '', image: s.image || '', order: Number(s.order || 0) }
}

export default function App() {
  // core data
  const [content, setContent] = useState(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const d = JSON.parse(raw)
        if (d.content) return { ...DEF, ...d.content }
      }
    } catch {}
    return { ...DEF }
  })
  const [projects, setProjects] = useState(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const d = JSON.parse(raw)
        if (d.projects) return d.projects
      }
    } catch {}
    return SAMPLE_PROJECTS.map((p, i) => ({ id: `sample-${i + 1}`, local: true, ...p }))
  })
  const [inbox, setInbox] = useState([])
  const [remoteMode, setRemoteMode] = useState(true)
  const [cloudState, setCloudState] = useState('Cloud: checking…')

  // UI state
  const [navOpen, setNavOpen] = useState(false)
  const [view, setView] = useState(null) // null | 'projects'|'about'|'contact'
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminOn, setAdminOn] = useState(false) // shows admin sidebar item after unlock
  const [unlocked, setUnlocked] = useState(false)
  const [lockOpen, setLockOpen] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinErr, setPinErr] = useState('')
  const [menuChecked, setMenuChecked] = useState(false)
  const [toast, setToast] = useState({ msg: '', err: false, on: false })
  const toastTimer = useRef(null)

  // chat
  const [ask, setAsk] = useState('')
  const [chat, setChat] = useState([]) // {cls:'q'|'a', html:string}
  const [busy, setBusy] = useState(false)
  const [hinted, setHinted] = useState(false)
  const [placeholder, setPlaceholder] = useState('')
  const chatOutRef = useRef(null)
  const askRef = useRef(null)
  const chatHistoryRef = useRef([]) // {role, content}

  // admin forms
  const [adminForm, setAdminForm] = useState(() => ({ ...DEF }))
  const [adminTab, setAdminTab] = useState('profile')
  const [pForm, setPForm] = useState({ title: '', blurb: '', tags: '', link: '', image: '', order: 0 })
  const [editId, setEditId] = useState(null)
  const [prevUrls, setPrevUrls] = useState({ av: '', ph: '', lg: '', p: '' })

  // contact form
  const [cf, setCf] = useState({ name: '', email: '', phone: '', msg: '' })
  const [showKeyDialog, setShowKeyDialog] = useState(false)
  const [tempKey, setTempKey] = useState(() => { try { return localStorage.getItem('openrouter_key') || '' } catch { return '' } })

  const showToast = useCallback((msg, err = false) => {
    setToast({ msg, err, on: true })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, on: false })), 3200)
  }, [])

  const saveCache = useCallback((c, projs) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ content: c, projects: projs }))
    } catch {}
  }, [])

  // keep body classes in sync
  useEffect(() => {
    document.body.classList.toggle('nav-open', navOpen)
    document.body.classList.toggle('view-open', !!view)
    document.body.classList.toggle('admin-open', adminOpen)
    if (adminOn) document.body.classList.add('admin-on')
  }, [navOpen, view, adminOpen, adminOn])

  // entrance teardown
  useEffect(() => {
    let done = false
    let t = null
    const finish = () => {
      if (done) return
      done = true
      document.documentElement.classList.remove('anim')
    }
    t = setTimeout(finish, 2600)
    const snd = document.querySelector('.send')
    const handler = () => {
      clearTimeout(t)
      setTimeout(finish, 700)
    }
    if (snd) snd.addEventListener('animationend', handler)
    return () => {
      clearTimeout(t)
      if (snd) snd.removeEventListener('animationend', handler)
    }
  }, [])

  // placeholder responsive
  useEffect(() => {
    const mT = window.matchMedia('(min-width:600px) and (max-width:1180px) and (min-height:600px)')
    const mC = window.matchMedia('(max-width:599px),(max-height:599px) and (max-width:1180px)')
    const sync = () => {
      const desktop = !(mT.matches || mC.matches)
      setPlaceholder(desktop ? '' : PH_TEXT)
    }
    sync()
    const l1 = () => sync()
    const l2 = () => sync()
    try {
      mT.addEventListener('change', l1)
      mC.addEventListener('change', l2)
    } catch {
      mT.addListener(l1)
      mC.addListener(l2)
    }
    return () => {
      try {
        mT.removeEventListener('change', l1)
        mC.removeEventListener('change', l2)
      } catch {
        mT.removeListener(l1)
        mC.removeListener(l2)
      }
    }
  }, [])

  // keyboard shortcuts - fixed stale closure
  const unlockedRef = useRef(unlocked)
  const lockOpenRef = useRef(lockOpen)
  const adminOpenRef = useRef(adminOpen)
  useEffect(() => { unlockedRef.current = unlocked }, [unlocked])
  useEffect(() => { lockOpenRef.current = lockOpen }, [lockOpen])
  useEffect(() => { adminOpenRef.current = adminOpen }, [adminOpen])

  useEffect(() => {
    let buf = ''
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (lockOpenRef.current) {
          setLockOpen(false)
          return
        }
        setMenuChecked(false)
        setNavOpen(false)
        setView(null)
        if (adminOpenRef.current) setAdminOpen(false)
      }
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key && e.key.length === 1) {
        buf = (buf + e.key.toLowerCase()).slice(-8)
        if (buf.indexOf('admin') > -1) {
          buf = ''
          if (!unlockedRef.current) {
            setPinErr('')
            setPinInput('')
            setLockOpen(true)
            setTimeout(() => document.getElementById('pinInput')?.focus(), 60)
          } else {
            setAdminOpen(true)
            setAdminOn(true)
            setView(null)
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // firebase listeners
  useEffect(() => {
    if (!fbOk) {
      setCloudState('Local only — Firestore unreachable')
      return
    }
    setCloudState(remoteMode ? 'Cloud: connected' : 'Local only — Firestore denied the write')
    // content
    const unsubContent = onSnapshot(
      doc(db, 'portfolio', 'content'),
      (d) => {
        if (d && d.exists()) {
          const c = docToContent(d.data())
          setContent(c)
          saveCache(c, projects)
        }
      },
      () => {}
    )
    const unsubProjects = onSnapshot(
      collection(db, 'projects'),
      (q) => {
        const a = []
        q.forEach((d) => a.push(snapToProject(d.id, d.data())))
        if (a.length && remoteMode) {
          a.sort((x, y) => x.order - y.order)
          setProjects(a)
          saveCache(content, a)
        }
      },
      () => {}
    )
    getDoc(doc(db, 'portfolio', 'content'))
      .then((d) => {
        if (d.exists()) {
          const c = docToContent(d.data())
          setContent(c)
          saveCache(c, projects)
        }
      })
      .catch(() => {})
    getDocs(collection(db, 'projects'))
      .then((q) => {
        const a = []
        q.forEach((d) => a.push(snapToProject(d.id, d.data())))
        a.sort((x, y) => x.order - y.order)
        if (a.length) {
          setProjects(a)
          saveCache(content, a)
        }
      })
      .catch(() => {})
    return () => {
      try { unsubContent() } catch {}
      try { unsubProjects() } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteMode])

  // update document title
  useEffect(() => {
    document.title = `${content.brandName || 'Portfolio'} — Describe an app. We'll build it.`
  }, [content.brandName])

  // sync adminForm when content changes
  useEffect(() => {
    setAdminForm({ ...content })
    setPrevUrls({
      av: sanitizeUrl(content.avatarUrl),
      ph: sanitizeUrl(content.photoUrl),
      lg: sanitizeUrl(content.logoUrl),
      p: sanitizeUrl(pForm.image),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  // save cache when content/projects change
  useEffect(() => {
    saveCache(content, projects)
  }, [content, projects, saveCache])

  // cloud state
  useEffect(() => {
    if (!fbOk) setCloudState('Local only — Firestore unreachable')
    else setCloudState(remoteMode ? 'Cloud: connected' : 'Local only — Firestore denied the write')
  }, [remoteMode])

  const handleOpenAdmin = useCallback(() => {
    if (!unlocked) {
      setPinErr('')
      setPinInput('')
      setLockOpen(true)
      setTimeout(() => document.getElementById('pinInput')?.focus(), 60)
      return
    }
    setAdminOpen(true)
    setAdminOn(true)
    setView(null)
    // load inbox
    if (fbOk) {
      const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(50))
      getDocs(q)
        .then((qs) => {
          const arr = []
          qs.forEach((d) => {
            const v = d.data()
            v.id = d.id
            arr.push(v)
          })
          setInbox(arr)
        })
        .catch((err) => {
          setInbox([])
          showToast(`Could not read messages: ${err.code}`, true)
        })
    }
  }, [unlocked, showToast])

  const doUnlock = useCallback(() => {
    const pin = String(content.adminPin || '1234').trim().toLowerCase()
    const got = pinInput.trim().toLowerCase()
    if (!got) return setPinErr('Enter the password.')
    if (got !== pin) return setPinErr('Wrong password. Try again.')
    setUnlocked(true)
    setLockOpen(false)
    showToast('Unlocked — admin editor open')
    // open admin after state updates
    setTimeout(() => {
      setAdminOpen(true)
      setAdminOn(true)
    }, 0)
  }, [pinInput, content.adminPin, showToast])

  const tryPin = useCallback((val) => {
    const pin = String(content.adminPin || '1234').trim().toLowerCase()
    const got = String(val || '').trim().toLowerCase()
    if (!got) return false
    if (got === pin) {
      setCf((s) => ({ ...s, phone: '' }))
      setUnlocked(true)
      setLockOpen(false)
      setAdminOpen(true)
      setAdminOn(true)
      return true
    }
    return false
  }, [content.adminPin])

  const openView = useCallback((name) => {
    setAdminOpen(false)
    setView(name)
    setNavOpen(false)
    setMenuChecked(false)
    // scroll view top
    setTimeout(() => {
      const el = document.getElementById('view')
      if (el) el.scrollTop = 0
    }, 0)
  }, [])
  const closeView = useCallback(() => {
    setView(null)
  }, [])
  const closeAdmin = useCallback(() => {
    setLockOpen(false)
    setAdminOpen(false)
  }, [])

  // chat helpers
  const pushMsg = useCallback((cls, html) => {
    setChat((c) => [...c, { cls, html }])
    setTimeout(() => {
      if (chatOutRef.current) chatOutRef.current.scrollTop = chatOutRef.current.scrollHeight
    }, 0)
  }, [])

  const buildSystemPrompt = useCallback(() => {
    const projs = projects.map((p) => `- ${p.title}: ${p.blurb || ''} [${p.tags || ''}] ${p.link || ''}`).join('\n')
    return `You are Fastshot portfolio assistant for ${content.name || 'Portfolio'} — ${content.role || ''}.\nTagline: ${content.tagline || ''}\nAbout: ${content.about || ''}\nSkills: ${content.skills || ''}\nContact: email=${content.email || ''}, phone=${content.phone || ''}, location=${content.location || ''}, availability=${content.availability || ''}, github=${content.github || ''}, linkedin=${content.linkedin || ''}\nProjects:\n${projs || 'No projects yet'}\nBe concise, friendly, and answer from this context first. If user asks outside scope, politely say you specialize in this portfolio but you can still help generally. Use plain text, you may use simple markdown bold. No disallowed content.`
  }, [content, projects])

  const callOpenRouter = useCallback(async (userMsg, history) => {
    const key = getOpenRouterKey()
    if (isKeyRevoked(key) || !key) {
      throw new Error('FREE_OFFLINE')
    }
    const messages = [{ role: 'system', content: buildSystemPrompt() }]
    if (history && history.length) history.slice(-6).forEach((h) => messages.push(h))
    messages.push({ role: 'user', content: userMsg })
    let res
    try {
      res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': window.location.href,
          'X-Title': 'Fastshot Portfolio',
        },
        body: JSON.stringify({ model: OPENROUTER_MODEL, messages, temperature: 0.7, max_tokens: 700 }),
      })
    } catch (e) {
      throw new Error(`Network error: ${e.message}`)
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      if (res.status === 401) throw new Error('FREE_OFFLINE')
      throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 300)}`)
    }
    const j = await res.json()
    const cnt = j.choices?.[0]?.message?.content || j.choices?.[0]?.message?.reasoning || ''
    if (!cnt || !String(cnt).trim()) throw new Error('Empty response')
    return cnt
  }, [buildSystemPrompt])

  const handleComposerSubmit = useCallback(async (e) => {
    if (e) e.preventDefault()
    const v = ask.trim()
    if (!v || busy) return
    setBusy(true)
    const userHtml = esc(v)
    setChat((c) => [...c, { cls: 'q', html: userHtml }])
    chatHistoryRef.current.push({ role: 'user', content: v })
    // typing indicator
    const typingId = `typing-${Date.now()}`
    setChat((c) => [...c, { cls: 'a', html: `<span class="typing-dots"><span></span><span></span><span></span></span> <span style="margin-left:6px;color:var(--ink-3);font-size:12px">thinking…</span>`, id: typingId }])
    if (fbOk) {
      try { await addDoc(collection(db, 'questions'), { q: v, createdAt: Date.now() }) } catch {}
    }
    setAsk('')
    try {
      const reply = await callOpenRouter(v, chatHistoryRef.current.slice(0, -1))
      setChat((c) => c.filter((x) => x.id !== typingId))
      const html = mdToHtml(reply)
      setChat((c) => [...c, { cls: 'a', html }])
      chatHistoryRef.current.push({ role: 'assistant', content: reply })
      if (chatHistoryRef.current.length > 16) chatHistoryRef.current = chatHistoryRef.current.slice(-16)
    } catch (err) {
      setChat((c) => c.filter((x) => x.id !== typingId))
      const fallback = buildFallbackAnswer(v, content, projects)
      const isRevoked = String(err.message).includes('FREE_OFFLINE') || String(err.message).includes('401') || String(err.message).includes('revoked')
      // Show clean portfolio answer as free model, with subtle hint to add key if offline
      const extra = isRevoked
        ? `<br><span class="muted" style="display:block;margin-top:8px;padding:8px 10px;background:rgba(24,24,27,.72);border:1px solid var(--line);border-radius:10px;font-size:12px">✅ <b>Free model active (offline portfolio)</b> — No key needed. For live AI, add your <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" style="color:var(--accent-2);text-decoration:underline">free OpenRouter key</a> <button id="openrouter-key-btn" onclick="window.dispatchEvent(new CustomEvent('open-key-dialog'))" style="margin-left:6px;padding:4px 8px;border-radius:6px;background:rgba(156,134,206,.18);border:1px solid rgba(156,134,206,.3);color:#fff;cursor:pointer;font-size:11px">Set key</button></span>`
        : `<br><span class="muted">(AI unavailable: ${esc(err.message).slice(0, 120)})</span>`
      setChat((c) => [...c, { cls: 'a', html: `${fallback}${extra}` }])
      chatHistoryRef.current.push({ role: 'assistant', content: fallback })
    } finally {
      setBusy(false)
      setTimeout(() => askRef.current?.focus(), 0)
      setTimeout(() => { if (chatOutRef.current) chatOutRef.current.scrollTop = chatOutRef.current.scrollHeight }, 50)
    }
  }, [ask, busy, content, projects, callOpenRouter])

  // initial welcome - make chat come up on first page
  useEffect(() => {
    if (!hinted && chat.length === 0) {
      setHinted(true)
      const welcome = `Hi — I'm the <b>Fastshot assistant</b> for <b>${esc(content.name)}</b> (${esc(content.role)}).<br>Ask me about <b>projects</b>, <b>skills</b>, <b>background</b> or <b>contact</b>.<br><span class="muted">Try: “What projects do you have?” · “Show your skills” · “How to reach you?”</span>`
      setChat([{ cls: 'a', html: welcome }])
      // also hint history for AI
      chatHistoryRef.current = []
    }
  }, [content.name, content.role, hinted, chat.length])

  // open key dialog from chat hint button
  useEffect(() => {
    const h = () => { try { setTempKey(localStorage.getItem('openrouter_key') || '') } catch {}; setShowKeyDialog(true) }
    window.addEventListener('open-key-dialog', h)
    return () => window.removeEventListener('open-key-dialog', h)
  }, [])

  // scroll chat
  useEffect(() => {
    if (chatOutRef.current) chatOutRef.current.scrollTop = chatOutRef.current.scrollHeight
  }, [chat])

  const filteredProjects = [...projects].sort((a, b) => a.order - b.order)

  return (
    <>
      <a href="#main" className="skip" style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
        Skip to content
      </a>
      <style>{`.skip:focus{left:12px;top:12px;width:auto;height:auto;padding:10px 14px;background:#fff;color:#000;z-index:100;border-radius:8px}`}</style>

      <div className="stage">
        <video
          className="stage-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1560' height='1008'%3E%3Crect width='100%25' height='100%25' fill='%230a0d12'/%3E%3C/svg%3E"
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_124724_bc041163-d651-425f-aea3-2acc1efc2c96.mp4"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />

        <button
          className="rail"
          id="railBtn"
          aria-label="Open portfolio menu"
          aria-expanded={navOpen ? 'true' : 'false'}
          aria-controls="sidebar"
          onClick={() => setNavOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="scrim" id="scrim" onClick={() => setNavOpen(false)} />

        <aside className="sidebar" id="sidebar" aria-label="Portfolio sections" role="navigation" aria-hidden={navOpen ? 'false' : 'true'}>
          <button className="sb-close xbtn" id="sbClose" aria-label="Close menu" onClick={() => setNavOpen(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
          <div className="sb-head">
            <span className="sb-av" id="sbAvWrap">
              {sanitizeUrl(content.avatarUrl) ? (
                <img
                  src={sanitizeUrl(content.avatarUrl)}
                  alt={`${content.name} avatar`}
                  style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 0 0 1px rgba(255,255,255,.16)' }}
                />
              ) : (
                <span className="ph-av" id="sbAv" aria-hidden="true">
                  {initials(content.name)}
                </span>
              )}
            </span>
            <div>
              <b id="sbName">{content.name || 'Portfolio'}</b>
              <i id="sbRole">{content.role || ''}</i>
            </div>
          </div>
          {[
            { id: 'home', label: 'Home', icon: (
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.3 2.5a1.2 1.2 0 0 1 1.4 0l8 6.1a1.2 1.2 0 0 1-.7 2.15H4a1.2 1.2 0 0 1-.7-2.15l8-6.1Z"/><path d="M5.2 12.2h2.4v7.3H5.2zM10.8 12.2h2.4v7.3h-2.4zM16.4 12.2h2.4v7.3h-2.4z"/><path d="M3.6 20.6h16.8v1.9H3.6z"/></svg>
            )},
            { id: 'projects', label: 'Projects', icon: (
              <svg viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="2" width="9" height="9" rx="2.4"/><rect x="13" y="2" width="9" height="9" rx="2.4"/><rect x="2" y="13" width="9" height="9" rx="2.4"/><rect x="13" y="13" width="9" height="9" rx="2.4"/></svg>
            )},
            { id: 'about', label: 'About', icon: (
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8Z"/><path d="M12 14.1c4.6 0 8.4 2.9 8.4 6.5 0 .6-.5 1.1-1.1 1.1H4.7c-.6 0-1.1-.5-1.1-1.1 0-3.6 3.8-6.5 8.4-6.5Z"/></svg>
            )},
            { id: 'contact', label: 'Contact', icon: (
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.6 6.4A2.4 2.4 0 0 1 5 4h14a2.4 2.4 0 0 1 2.4 2.4v11.2A2.4 2.4 0 0 1 19 20H5a2.4 2.4 0 0 1-2.4-2.4V6.4Zm2.1.6 6.6 4.6a1.3 1.3 0 0 0 1.4 0l6.6-4.6H4.7Z"/></svg>
            )},
          ].map((it) => (
            <button
              key={it.id}
              className={`sb-item ${(!view && it.id === 'home') || view === it.id ? 'on' : ''}`}
              data-view={it.id}
              onClick={() => {
                if (it.id === 'home') {
                  setAdminOpen(false)
                  setView(null)
                  setNavOpen(false)
                } else {
                  setAdminOpen(false)
                  openView(it.id)
                }
              }}
            >
              {it.icon}
              <span>{it.label}</span>
            </button>
          ))}
          <button className={`sb-item ${adminOpen ? 'on' : ''}`} style={{ display: 'flex', opacity: unlocked ? 1 : 0.85, border: unlocked ? undefined : '1px dashed rgba(248,178,133,.4)' }} data-view="admin" onClick={handleOpenAdmin} title={unlocked ? 'Admin editor' : 'Admin (locked) - click to unlock'}>
            <svg viewBox="0 0 24 24" fill={unlocked ? 'currentColor' : 'none'} stroke={unlocked ? 'none' : 'currentColor'} strokeWidth={unlocked ? undefined : '1.6'}><path d="M17 9V7.4a5 5 0 0 0-10 0V9H5.6c-.6 0-1.1.5-1.1 1.1v9.2c0 .6.5 1.1 1.1 1.1h12.8c.6 0 1.1-.5 1.1-1.1v-9.2c0-.6-.5-1.1-1.1-1.1H17Zm-8-1.6a3 3 0 0 1 6 0V9H9V7.4Z" fill={unlocked ? 'currentColor' : 'none'} /></svg>
            <span>{unlocked ? 'Admin' : 'Admin (locked)'}</span>
            {!unlocked && <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--accent-2)' }}>🔒</span>}
          </button>
          <div className="sb-foot">Fastshot portfolio · data lives in Cloud Firestore · photos hosted via ImgBB</div>
        </aside>

        <div className="frame">
          <input type="checkbox" id="menu" checked={menuChecked} onChange={(e) => setMenuChecked(e.target.checked)} />

          <header className="nav">
            <a
              className="brand"
              href="#"
              id="brandLink"
              aria-label="Home"
              onClick={(e) => {
                e.preventDefault()
                closeView()
                setNavOpen(false)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              <span className="mark" id="brandMark">
                {sanitizeUrl(content.logoUrl) ? (
                  <img className="brand-img" src={sanitizeUrl(content.logoUrl)} alt="Brand logo" />
                ) : (
                  <svg className="mark" viewBox="0 0 34 34" aria-hidden="true">
                    <circle cx="17" cy="17" r="17" fill="#9C86CE" />
                    <circle cx="17" cy="17" r="8.6" fill="#FFFFFF" />
                    <circle cx="17" cy="17" r="3.7" fill="#151519" />
                  </svg>
                )}
              </span>
              <span className="word disp" id="brandWord">
                {content.brandName || 'Portfolio'}
              </span>
            </a>

            <div className={`owner ${sanitizeUrl(content.avatarUrl) ? 'on' : ''}`} id="owner">
              {sanitizeUrl(content.avatarUrl) && <img id="ownerImg" src={sanitizeUrl(content.avatarUrl)} alt="" />}
              <span id="ownerName">{content.name}</span>
            </div>

            <a
              className="cta"
              href="#"
              onClick={(e) => {
                e.preventDefault()
                openView('contact')
              }}
            >
              <span className="disp">Get Started</span>
            </a>

            <label className="burger" htmlFor="menu" aria-label="Menu" aria-expanded={menuChecked ? 'true' : 'false'} role="button" tabIndex={0}>
              <svg width="17" height="12" viewBox="0 0 17 12" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
                <path d="M1 2h15M1 10h15" />
              </svg>
            </label>
          </header>

          <div className="sheet">
            <div className="sheet-in">
              <div className="sheet-panel">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    openView('projects')
                  }}
                >
                  Projects
                </a>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    openView('about')
                  }}
                >
                  About
                </a>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    openView('contact')
                  }}
                >
                  Contact
                </a>
                <a
                  className="sheet-cta"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setMenuChecked(false)
                    openView('contact')
                  }}
                >
                  Get Started
                </a>
              </div>
            </div>
          </div>

          <main className="hero" id="main" tabIndex={-1} style={{ justifyContent: 'flex-start', paddingTop: 'clamp(18px,4vh,40px)', gap: 'clamp(14px,2.8vh,28px)' }}>
            <div style={{ textAlign: 'center', maxWidth: '720px' }}>
              <h1 className="h1" style={{ fontSize: 'clamp(28px,4.4vw,36.25px)' }}>Describe an app. We'll build it.</h1>
              <p style={{ color: 'var(--ink-2)', fontSize: '13px', marginTop: '10px', letterSpacing: '0.007em' }}>Chat with the portfolio — powered by <b style={{ color: '#fff', fontWeight: 500 }}>OpenRouter Free</b> + Firestore</p>
            </div>

            <div className="composer" style={{ gap: '14px' }}>
              <div className="chat-out on" id="chatOut" ref={chatOutRef} aria-live="polite" aria-atomic="false" style={{ display: 'flex', maxHeight: 'min(42vh, 380px)', minHeight: '220px', background: 'rgba(24,24,27,.55)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid var(--line)', borderRadius: '18px', padding: '14px', boxShadow: '0 12px 40px rgba(0,0,0,.28)' }}>
                {chat.length === 0 ? (
                  <div className="msg a" style={{ alignSelf: 'flex-start' }}><span className="typing-dots"><span></span><span></span><span></span></span> <span style={{ marginLeft: 6, color: 'var(--ink-3)', fontSize: 12 }}>loading chat…</span></div>
                ) : (
                  chat.map((m, i) => (
                    <div key={i} className={`msg ${m.cls}`} dangerouslySetInnerHTML={m.cls === 'q' ? undefined : { __html: m.html }}>
                      {m.cls === 'q' ? m.html : null}
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {['What projects do you have?', 'Show your skills', 'How to contact?', 'Tell me about Ledgerly'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="tag"
                    style={{ cursor: 'pointer', borderColor: 'rgba(248,178,133,.22)', background: 'rgba(255,255,255,.06)', color: '#E9E9EC', padding: '7px 12px', fontSize: '12px' }}
                    onClick={() => {
                      setAsk(t)
                      setTimeout(() => {
                        const fake = { preventDefault: () => {}, target: { value: t } }
                        // setAsk is async, so use direct submit with t
                        const v = t.trim()
                        if (!v || busy) return
                        setBusy(true)
                        const userHtml = esc(v)
                        setChat((c) => [...c, { cls: 'q', html: userHtml }])
                        chatHistoryRef.current.push({ role: 'user', content: v })
                        const typingId = `typing-${Date.now()}`
                        setChat((c) => [...c, { cls: 'a', html: `<span class="typing-dots"><span></span><span></span><span></span></span> <span style="margin-left:6px;color:var(--ink-3);font-size:12px">thinking…</span>`, id: typingId }])
                        if (fbOk) { try { addDoc(collection(db, 'questions'), { q: v, createdAt: Date.now() }) } catch {} }
                        setAsk('')
                        callOpenRouter(v, chatHistoryRef.current.slice(0, -1))
                          .then((reply) => {
                            setChat((c) => c.filter((x) => x.id !== typingId))
                            const html = mdToHtml(reply)
                            setChat((c) => [...c, { cls: 'a', html }])
                            chatHistoryRef.current.push({ role: 'assistant', content: reply })
                            if (chatHistoryRef.current.length > 16) chatHistoryRef.current = chatHistoryRef.current.slice(-16)
                          })
                          .catch((err) => {
                            setChat((c) => c.filter((x) => x.id !== typingId))
                            const fallback = buildFallbackAnswer(v, content, projects)
                            const isRevoked2 = String(err.message).includes('FREE_OFFLINE') || String(err.message).includes('401') || String(err.message).includes('revoked')
                            const extra2 = isRevoked2
                              ? `<br><span class="muted" style="display:block;margin-top:8px;padding:8px 10px;background:rgba(24,24,27,.72);border:1px solid var(--line);border-radius:10px;font-size:12px">✅ <b>Free model active (offline portfolio)</b> — No key needed.</span>`
                              : `<br><span class="muted">(AI unavailable: ${esc(err.message).slice(0, 120)})</span>`
                            setChat((c) => [...c, { cls: 'a', html: `${fallback}${extra2}` }])
                            chatHistoryRef.current.push({ role: 'assistant', content: fallback })
                          })
                          .finally(() => {
                            setBusy(false)
                            setTimeout(() => askRef.current?.focus(), 0)
                          })
                      }, 10)
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <form
                className={`card ${ask.trim() ? 'typing' : ''}`}
                id="composer"
                onSubmit={handleComposerSubmit}
                autoComplete="off"
                aria-label="Portfolio chat composer"
                onClick={(e) => {
                  if (e.target.closest('.tools') || e.target.closest('button')) return
                  askRef.current?.focus()
                }}
              >
                <p className="ph" id="ph">
                  {PH_TEXT}
                </p>
                <input
                  className="ask"
                  id="ask"
                  ref={askRef}
                  type="text"
                  inputMode="text"
                  spellCheck={false}
                  aria-label="Ask the portfolio assistant anything"
                  placeholder={placeholder}
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleComposerSubmit(e)
                    }
                  }}
                />

                <div className="tools">
                  <div className="right">
                    <button id="openrouter-key-btn" className="model" type="button" aria-label="Model: OpenRouter Free minimax-m3" onClick={() => {
                      const k = getOpenRouterKey()
                      if (isKeyRevoked(k)) {
                        setTempKey(localStorage.getItem('openrouter_key') || '')
                        setShowKeyDialog(true)
                      } else {
                        showToast(`Model: ${OPENROUTER_MODEL} (key set). Data: Firestore + local cache.`)
                      }
                    }}>
                      <span>OpenRouter · Free {isKeyRevoked(getOpenRouterKey()) ? '• offline' : '• live'}</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>

                    <button
                      className="attach"
                      type="button"
                      aria-label="Attach a file"
                      onClick={() => {
                        const inp = document.createElement('input')
                        inp.type = 'file'
                        inp.accept = 'image/*,.pdf,.txt'
                        inp.onchange = () => {
                          if (inp.files && inp.files[0]) showToast(`Attached "${inp.files[0].name}" — demo mode (not sent to AI)`)
                        }
                        inp.click()
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                    </button>

                    <button className="send" type="submit" aria-label="Build it" disabled={busy}>
                      <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                        <path d="M12.6 2.5c.42 0 .8.23.99.6l7.6 14.8a.97.97 0 0 1-1.26 1.33l-6.45-2.66a1.15 1.15 0 0 0-.88 0l-6.45 2.66a.97.97 0 0 1-1.26-1.33l7.6-14.8c.19-.37.57-.6.99-.6Z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </main>
        </div>
      </div>

      {/* Views */}
      <section className="view" id="view" aria-label="Portfolio content" style={{ opacity: view ? 1 : 0, visibility: view ? 'visible' : 'hidden', pointerEvents: view ? 'auto' : 'none' }}>
        <div className="wrap">
          <div data-pane="projects" hidden={view !== 'projects' ? true : undefined}>
            <h2 className="v-title">
              Projects
              <button className="v-close" type="button" data-close aria-label="Close Projects" onClick={closeView}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              </button>
            </h2>
            <p className="v-sub" id="projCount">
              {filteredProjects.length ? `${filteredProjects.length} project${filteredProjects.length === 1 ? '' : 's'} in the collection.` : 'No projects yet — add them from the hidden admin editor.'}
            </p>
            <div className="grid-p" id="projGrid">
              {filteredProjects.map((p) => (
                <div key={p.id} className="card-g pc">
                  {sanitizeUrl(p.image) ? (
                    <div className="pc-img">
                      <img src={sanitizeUrl(p.image)} alt={p.title} loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />
                    </div>
                  ) : null}
                  <h3>{p.title}</h3>
                  {p.blurb ? <p>{p.blurb}</p> : null}
                  {p.tags ? (
                    <div className="tags">
                      {String(p.tags)
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .map((t) => (
                          <span key={t} className="tag">
                            {t}
                          </span>
                        ))}
                    </div>
                  ) : null}
                  {sanitizeUrl(p.link) ? (
                    <a className="p-link" href={sanitizeUrl(p.link)} target="_blank" rel="noopener">
                      View →
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div data-pane="about" hidden={view !== 'about' ? true : undefined}>
            <h2 className="v-title">
              About
              <button className="v-close" type="button" data-close aria-label="Close About" onClick={closeView}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              </button>
            </h2>
            <div className={`card-g about-top ${sanitizeUrl(content.photoUrl) ? '' : 'no-photo'}`}>
              <div className="about-photo" id="aboutPhotoBox" hidden={!sanitizeUrl(content.photoUrl) ? true : undefined}>
                {sanitizeUrl(content.photoUrl) ? (
                  <img src={sanitizeUrl(content.photoUrl)} alt={content.name} />
                ) : (
                  <span>FS</span>
                )}
              </div>
              <div className="about-body">
                <h3 id="abName">{content.name}</h3>
                <h4 id="abRole">{content.role}{content.tagline ? ` — ${content.tagline}` : ''}</h4>
                <p id="abText">{content.about}</p>
              </div>
            </div>
            <div className="card-g">
              <div className="tags" id="abSkills">
                {String(content.skills || '')
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((s) => (
                    <span key={s} className="tag">
                      {s}
                    </span>
                  ))}
              </div>
            </div>
            <div className="card-g kv" id="abKv">
              {['Email', content.email].filter((x) => x[1]).length ? null : null}
              {[
                ['Email', content.email],
                ['Phone', content.phone],
                ['Location', content.location],
                ['Availability', content.availability],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <i>{k}</i>
                    <b>{v}</b>
                  </div>
                ))}
              {(content.github || content.linkedin) && (
                <div>
                  <i>Links</i>
                  {content.github && sanitizeUrl(content.github) ? <><a href={sanitizeUrl(content.github)} target="_blank" rel="noopener">GitHub</a><br /></> : null}
                  {content.linkedin && sanitizeUrl(content.linkedin) ? <><a href={sanitizeUrl(content.linkedin)} target="_blank" rel="noopener">LinkedIn</a><br /></> : null}
                </div>
              )}
            </div>
          </div>

          <div data-pane="contact" hidden={view !== 'contact' ? true : undefined}>
            <h2 className="v-title">
              Contact
              <button className="v-close" type="button" data-close aria-label="Close Contact" onClick={closeView}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              </button>
            </h2>
            <p className="v-sub" id="ctLine">
              {content.tagline ? `Say hello — ${content.tagline}` : 'Get in touch.'}
            </p>
            <div className="card-g kv" id="ctKv">
              {[
                ['Email', content.email],
                ['Phone', content.phone],
                ['Location', content.location],
                ['Availability', content.availability],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <i>{k}</i>
                    <b>{v}</b>
                  </div>
                ))}
              {(content.github || content.linkedin) && (
                <div>
                  <i>Links</i>
                  {content.github && sanitizeUrl(content.github) ? <><a href={sanitizeUrl(content.github)} target="_blank" rel="noopener">GitHub</a><br /></> : null}
                  {content.linkedin && sanitizeUrl(content.linkedin) ? <><a href={sanitizeUrl(content.linkedin)} target="_blank" rel="noopener">LinkedIn</a><br /></> : null}
                </div>
              )}
            </div>
            <div className="card-g">
              <form
                id="contactForm"
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (tryPin(cf.phone)) return
                  if (cf.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cf.email)) return showToast('Enter a valid email', true)
                  if (cf.msg.trim().length < 8) return showToast('Message too short', true)
                  const data = { name: cf.name.trim(), email: cf.email.trim(), phone: cf.phone.trim(), message: cf.msg.trim(), createdAt: Date.now() }
                  if (!fbOk) return showToast('Saved locally (offline)', true)
                  try {
                    await addDoc(collection(db, 'messages'), data)
                    setCf({ name: '', email: '', phone: '', msg: '' })
                    showToast('Message sent — thank you')
                  } catch (err) {
                    showToast(`Could not send: ${err.code}`, true)
                  }
                }}
              >
                <div className="frow">
                  <div className="field">
                    <label htmlFor="cfName">Name</label>
                    <input id="cfName" required placeholder="Your name" value={cf.name} onChange={(e) => setCf((s) => ({ ...s, name: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label htmlFor="cfEmail">Email</label>
                    <input id="cfEmail" type="email" required placeholder="you@company.com" value={cf.email} onChange={(e) => setCf((s) => ({ ...s, email: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="cfPhone">Contact number</label>
                  <input id="cfPhone" inputMode="text" autoComplete="off" spellCheck={false} placeholder="Your number" value={cf.phone} onChange={(e) => setCf((s) => ({ ...s, phone: e.target.value }))} onBlur={(e) => tryPin(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="cfMsg">Message</label>
                  <textarea id="cfMsg" required placeholder="What are you building?" value={cf.msg} onChange={(e) => setCf((s) => ({ ...s, msg: e.target.value }))} />
                </div>
                <div>
                  <button className="btn acc" type="submit">
                    Send message
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Admin */}
      <section className="admin" id="admin" aria-label="Admin editor" style={{ display: adminOpen ? 'block' : 'none' }}>
        <div className="adm-wrap">
          <div className="adm-head">
            <h2>Admin · content editor</h2>
            <span className={`cloud ${!fbOk || !remoteMode ? 'bad' : ''}`} id="cloudState">
              {cloudState}
            </span>
            <div className="r" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn ghost sm" id="admClose" onClick={closeAdmin}>
                Back to site
              </button>
              <button className="xbtn" id="admClose2" style={{ marginLeft: 0 }} aria-label="Close admin" onClick={closeAdmin}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              </button>
            </div>
          </div>
          <button className="adm-float" id="admFloat" type="button" aria-label="Close admin" onClick={closeAdmin}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>

          <div className="tabs">
            {[
              ['profile', 'Profile & photos'],
              ['projects', 'Projects'],
              ['inbox', 'Inbox'],
            ].map(([id, label]) => (
              <button key={id} className={`tab ${adminTab === id ? 'on' : ''}`} data-tab={id} onClick={() => setAdminTab(id)}>
                {label}
              </button>
            ))}
          </div>

          <div className={`tabpane ${adminTab === 'profile' ? 'on' : ''}`} data-pane="profile">
            <div className="card-g" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="up">
                <img className="up-img" id="lgPrev" alt="" hidden={!prevUrls.lg} src={prevUrls.lg || undefined} />
                <div className="field" style={{ flex: 1, minWidth: 180 }}>
                  <label>Brand logo (nav mark)</label>
                  <div className="up">
                    <span className="btn ghost sm filebtn">
                      Upload via ImgBB
                      <input
                        type="file"
                        id="lgFile"
                        accept="image/*"
                        onChange={async (e) => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          showToast('Uploading to ImgBB…')
                          try {
                            const url = await imgbb(f)
                            setAdminForm((s) => ({ ...s, logoUrl: url }))
                            setPrevUrls((s) => ({ ...s, lg: url }))
                            showToast('Image uploaded — now press Save')
                          } catch (err) {
                            showToast(`Upload failed: ${err.message}`, true)
                          }
                          e.target.value = ''
                        }}
                      />
                    </span>
                    <input
                      id="lgUrl"
                      placeholder="or paste a logo URL (blank = default mark)"
                      value={adminForm.logoUrl || ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setAdminForm((s) => ({ ...s, logoUrl: v }))
                        setPrevUrls((s) => ({ ...s, lg: sanitizeUrl(v) }))
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="frow">
                <div className="field">
                  <label>Brand name (nav wordmark + tab title)</label>
                  <input id="fBrand" value={adminForm.brandName || ''} onChange={(e) => setAdminForm((s) => ({ ...s, brandName: e.target.value }))} />
                </div>
                <div className="field">
                  <label htmlFor="fPin">Admin password</label>
                  <input id="fPin" type="password" autoComplete="off" spellCheck={false} aria-describedby="pinHelp" value={adminForm.adminPin || ''} onChange={(e) => setAdminForm((s) => ({ ...s, adminPin: e.target.value }))} />
                  <span id="pinHelp" className="note">Stored locally & in Firestore - use a strong, unique value.</span>
                </div>
              </div>
              <div className="up">
                <img className="up-img" id="avPrev" alt="" hidden={!prevUrls.av} src={prevUrls.av || undefined} />
                <div className="field" style={{ flex: 1, minWidth: 180 }}>
                  <label>Main page avatar (small, shown in nav + sidebar)</label>
                  <div className="up">
                    <span className="btn ghost sm filebtn">
                      Upload via ImgBB
                      <input
                        type="file"
                        id="avFile"
                        accept="image/*"
                        onChange={async (e) => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          showToast('Uploading to ImgBB…')
                          try {
                            const url = await imgbb(f)
                            setAdminForm((s) => ({ ...s, avatarUrl: url }))
                            setPrevUrls((s) => ({ ...s, av: url }))
                            showToast('Image uploaded — now press Save')
                          } catch (err) {
                            showToast(`Upload failed: ${err.message}`, true)
                          }
                          e.target.value = ''
                        }}
                      />
                    </span>
                    <input
                      id="avUrl"
                      placeholder="or paste an image URL"
                      value={adminForm.avatarUrl || ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setAdminForm((s) => ({ ...s, avatarUrl: v }))
                        setPrevUrls((s) => ({ ...s, av: sanitizeUrl(v) }))
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="up">
                <img className="up-cover" id="phPrev" alt="" hidden={!prevUrls.ph} src={prevUrls.ph || undefined} />
                <div className="field" style={{ flex: 1, minWidth: 180 }}>
                  <label>About page photo</label>
                  <div className="up">
                    <span className="btn ghost sm filebtn">
                      Upload via ImgBB
                      <input
                        type="file"
                        id="phFile"
                        accept="image/*"
                        onChange={async (e) => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          showToast('Uploading to ImgBB…')
                          try {
                            const url = await imgbb(f)
                            setAdminForm((s) => ({ ...s, photoUrl: url }))
                            setPrevUrls((s) => ({ ...s, ph: url }))
                            showToast('Image uploaded — now press Save')
                          } catch (err) {
                            showToast(`Upload failed: ${err.message}`, true)
                          }
                          e.target.value = ''
                        }}
                      />
                    </span>
                    <input
                      id="phUrl"
                      placeholder="or paste an image URL"
                      value={adminForm.photoUrl || ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setAdminForm((s) => ({ ...s, photoUrl: v }))
                        setPrevUrls((s) => ({ ...s, ph: sanitizeUrl(v) }))
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="frow">
                <div className="field">
                  <label>Name</label>
                  <input id="fName" value={adminForm.name || ''} onChange={(e) => setAdminForm((s) => ({ ...s, name: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Role / title</label>
                  <input id="fRole" value={adminForm.role || ''} onChange={(e) => setAdminForm((s) => ({ ...s, role: e.target.value }))} />
                </div>
              </div>
              <div className="field">
                <label>Tagline</label>
                <input id="fTag" value={adminForm.tagline || ''} onChange={(e) => setAdminForm((s) => ({ ...s, tagline: e.target.value }))} />
              </div>
              <div className="frow">
                <div className="field">
                  <label>Email</label>
                  <input id="fEmail" value={adminForm.email || ''} onChange={(e) => setAdminForm((s) => ({ ...s, email: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Phone</label>
                  <input id="fPhone" value={adminForm.phone || ''} onChange={(e) => setAdminForm((s) => ({ ...s, phone: e.target.value }))} />
                </div>
              </div>
              <div className="frow">
                <div className="field">
                  <label>Location</label>
                  <input id="fLoc" value={adminForm.location || ''} onChange={(e) => setAdminForm((s) => ({ ...s, location: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Availability</label>
                  <input id="fAvail" value={adminForm.availability || ''} onChange={(e) => setAdminForm((s) => ({ ...s, availability: e.target.value }))} />
                </div>
              </div>
              <div className="frow">
                <div className="field">
                  <label>GitHub</label>
                  <input id="fGh" value={adminForm.github || ''} onChange={(e) => setAdminForm((s) => ({ ...s, github: e.target.value }))} />
                </div>
                <div className="field">
                  <label>LinkedIn</label>
                  <input id="fLi" value={adminForm.linkedin || ''} onChange={(e) => setAdminForm((s) => ({ ...s, linkedin: e.target.value }))} />
                </div>
              </div>
              <div className="field">
                <label>Skills (comma separated)</label>
                <input id="fSkills" value={adminForm.skills || ''} onChange={(e) => setAdminForm((s) => ({ ...s, skills: e.target.value }))} />
              </div>
              <div className="field">
                <label>About</label>
                <textarea id="fAbout" value={adminForm.about || ''} onChange={(e) => setAdminForm((s) => ({ ...s, about: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn acc"
                  id="saveProfile"
                  onClick={async () => {
                    const data = { ...adminForm, updatedAt: Date.now() }
                    const applyLocal = (msg, warn) => {
                      setContent(docToContent(data))
                      showToast(msg, !!warn)
                    }
                    if (!fbOk) return applyLocal('Saved locally (offline)', true)
                    try {
                      await setDoc(doc(db, 'portfolio', 'content'), data, { merge: true })
                      applyLocal('Saved to Firestore')
                    } catch (err) {
                      if (err && (err.code === 'permission-denied' || err.code === 'unavailable' || err.code === 'failed-precondition')) {
                        setRemoteMode(false)
                        applyLocal('Saved locally — Firestore denied the write. Check your security rules.', true)
                      } else showToast(`Save failed: ${err.code || err.message}`, true)
                    }
                  }}
                >
                  Save to Firestore
                </button>
                <button className="btn ghost" id="pullProfile" onClick={() => { setAdminForm({ ...content }); showToast('Form refreshed') }}>
                  Reload
                </button>
                <button
                  className="btn ghost"
                  id="seedData"
                  onClick={async () => {
                    if (!fbOk) return showToast('Firestore unavailable in this session', true)
                    try {
                      await setDoc(doc(db, 'portfolio', 'content'), { ...DEF, updatedAt: Date.now() }, { merge: true })
                      for (let i = 0; i < SAMPLE_PROJECTS.length; i++) {
                        const p = { ...SAMPLE_PROJECTS[i], createdAt: Date.now(), updatedAt: Date.now() }
                        await addDoc(collection(db, 'projects'), p)
                      }
                      showToast('Sample data inserted')
                    } catch (err) {
                      showToast(`Could not write sample data: ${err.code}`, true)
                    }
                  }}
                >
                  Insert sample data
                </button>
              </div>
              <p className="note">
                Writes go to <b>portfolio/content</b>. Photos are uploaded to ImgBB and only the resulting link is stored in Firestore (no Storage bucket used).
              </p>
            </div>
          </div>

          <div className={`tabpane ${adminTab === 'projects' ? 'on' : ''}`} data-pane="projects">
            <div className="card-g" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h4 style={{ fontSize: 14, color: '#fff' }}>Add a project</h4>
              <div className="frow">
                <div className="field">
                  <label>Title</label>
                  <input id="pTitle" value={pForm.title} onChange={(e) => setPForm((s) => ({ ...s, title: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Link</label>
                  <input id="pLink" placeholder="https://" value={pForm.link} onChange={(e) => setPForm((s) => ({ ...s, link: e.target.value }))} />
                </div>
              </div>
              <div className="field">
                <label>Description</label>
                <textarea id="pBlurb" style={{ minHeight: 80 }} value={pForm.blurb} onChange={(e) => setPForm((s) => ({ ...s, blurb: e.target.value }))} />
              </div>
              <div className="frow">
                <div className="field">
                  <label>Tags (comma separated)</label>
                  <input id="pTags" value={pForm.tags} onChange={(e) => setPForm((s) => ({ ...s, tags: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Order (number)</label>
                  <input id="pOrder" type="number" value={pForm.order} onChange={(e) => setPForm((s) => ({ ...s, order: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="up">
                <img className="up-cover" id="pPrev" alt="" hidden={!prevUrls.p} src={prevUrls.p || undefined} style={{ width: 120, height: 75, borderRadius: 10 }} />
                <div className="field" style={{ flex: 1, minWidth: 180 }}>
                  <label>Cover image</label>
                  <div className="up">
                    <span className="btn ghost sm filebtn">
                      Upload via ImgBB
                      <input
                        type="file"
                        id="pFile"
                        accept="image/*"
                        onChange={async (e) => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          showToast('Uploading to ImgBB…')
                          try {
                            const url = await imgbb(f)
                            setPForm((s) => ({ ...s, image: url }))
                            setPrevUrls((s) => ({ ...s, p: url }))
                            showToast('Image uploaded — now press Save')
                          } catch (err) {
                            showToast(`Upload failed: ${err.message}`, true)
                          }
                          e.target.value = ''
                        }}
                      />
                    </span>
                    <input
                      id="pUrl"
                      placeholder="or paste an image URL"
                      value={pForm.image}
                      onChange={(e) => {
                        const v = e.target.value
                        setPForm((s) => ({ ...s, image: v }))
                        setPrevUrls((s) => ({ ...s, p: sanitizeUrl(v) }))
                      }}
                    />
                  </div>
                </div>
              </div>
              <div>
                <button
                  className="btn acc"
                  id="addProject"
                  onClick={async () => {
                    if (!pForm.title.trim()) return showToast('Add a title first', true)
                    const data = { title: pForm.title.trim(), blurb: pForm.blurb.trim(), tags: pForm.tags.trim(), link: pForm.link.trim(), image: pForm.image.trim(), order: Number(pForm.order || 0), updatedAt: Date.now() }
                    const clearForm = () => {
                      setPForm({ title: '', blurb: '', tags: '', link: '', image: '', order: 0 })
                      setPrevUrls((s) => ({ ...s, p: '' }))
                      setEditId(null)
                    }
                    const applyLocal = (msg, warn) => {
                      if (editId) {
                        setProjects((prev) => prev.map((x) => (x.id === editId ? { ...x, ...data, local: !fbOk || !remoteMode } : x)))
                        setEditId(null)
                      } else {
                        setProjects((prev) => [...prev, { id: `local-${Date.now()}`, local: true, ...data }])
                      }
                      clearForm()
                      showToast(msg, !!warn)
                    }
                    if (!fbOk || !remoteMode) return applyLocal('Saved locally (cloud not writable)', true)
                    try {
                      if (editId) {
                        await setDoc(doc(db, 'projects', editId), data, { merge: true })
                        setEditId(null)
                        showToast('Project updated')
                      } else {
                        data.createdAt = Date.now()
                        await addDoc(collection(db, 'projects'), data)
                        showToast('Project added')
                      }
                      clearForm()
                    } catch (err) {
                      if (err && (err.code === 'permission-denied' || err.code === 'unavailable' || err.code === 'failed-precondition')) {
                        setRemoteMode(false)
                        applyLocal('Saved locally — Firestore denied the write. Check your security rules.', true)
                      } else showToast(`Save failed: ${err.code || err.message}`, true)
                    }
                  }}
                >
                  {editId ? 'Update project' : 'Add project'}
                </button>
              </div>
            </div>
            <div className="card-g" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} id="admProjects">
              {filteredProjects.length === 0 ? <p className="note">No projects yet.</p> : filteredProjects.map((p) => (
                <div key={p.id} className="row-i">
                  <div>
                    <h4>{p.title}{p.local ? '   ·   sample' : ''}</h4>
                    {p.blurb ? <p>{p.blurb}</p> : null}
                    {p.link ? <p>{p.link}</p> : null}
                  </div>
                  <div className="r">
                    <button
                      className="btn ghost sm"
                      onClick={() => {
                        setPForm({ title: p.title, blurb: p.blurb, tags: p.tags, link: p.link, image: p.image || '', order: p.order })
                        setPrevUrls((s) => ({ ...s, p: sanitizeUrl(p.image) }))
                        setEditId(p.id)
                        showToast('Loaded into the form — press Add project to save changes')
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn ghost sm"
                      onClick={async () => {
                        const dropLocal = (msg, warn) => {
                          setProjects((prev) => prev.filter((x) => x.id !== p.id))
                          showToast(msg, !!warn)
                        }
                        if (p.local) return dropLocal('Sample project removed')
                        if (!fbOk || !remoteMode) return dropLocal('Removed locally (cloud not writable)', true)
                        try {
                          await deleteDoc(doc(db, 'projects', p.id))
                          dropLocal('Project deleted')
                        } catch (err) {
                          if (err && (err.code === 'permission-denied' || err.code === 'unavailable' || err.code === 'failed-precondition')) {
                            setRemoteMode(false)
                            dropLocal('Removed locally — Firestore denied the write. Check your security rules.', true)
                          } else showToast(`Delete failed: ${err.code || err.message}`, true)
                        }
                      }}
                    >
                      {p.local ? 'Remove' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`tabpane ${adminTab === 'inbox' ? 'on' : ''}`} data-pane="inbox">
            <div className="card-g" style={{ display: 'flex', flexDirection: 'column', gap: 14 }} id="admInbox">
              {inbox.length === 0 ? <p className="note">No messages yet.</p> : inbox.map((m) => (
                <div key={m.id} className="msg-item">
                  <div>
                    <b>{m.name || '(no name)'}</b>
                    <span>{(m.email || '') + ' · ' + (m.createdAt ? new Date(m.createdAt).toLocaleString() : '')}</span>
                  </div>
                  <p>{m.message || ''}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className={`lock ${lockOpen ? 'on' : ''}`} id="lock" role="dialog" aria-modal="true" aria-label="Admin password">
        <div className="lock-card">
          <h3>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 9V7.4a5 5 0 0 0-10 0V9H5.6c-.6 0-1.1.5-1.1 1.1v9.2c0 .6.5 1.1 1.1 1.1h12.8c.6 0 1.1-.5 1.1-1.1v-9.2c0-.6-.5-1.1-1.1-1.1H17Zm-8-1.6a3 3 0 0 1 6 0V9H9V7.4Z" />
            </svg>
            Protected area
          </h3>
          <p>Enter the admin password to edit this portfolio&apos;s content, projects and photos.</p>
          <div className="field">
            <label htmlFor="pinInput">Password</label>
            <input id="pinInput" type="password" autoComplete="off" spellCheck={false} value={pinInput} onChange={(e) => setPinInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doUnlock() } }} />
          </div>
          <div className="lock-err" id="pinErr">{pinErr}</div>
          <div className="lock-row">
            <button className="btn acc" id="pinOk" style={{ flex: 1 }} onClick={doUnlock}>
              Unlock
            </button>
            <button className="btn ghost" id="pinCancel" onClick={() => setLockOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      <div className={`toast ${toast.on ? 'on' : ''} ${toast.err ? 'err' : ''}`} id="toast" role="status" aria-live="polite" aria-atomic="true">
        {toast.msg}
      </div>

      {showKeyDialog && (
        <div className="lock on" role="dialog" aria-modal="true" aria-label="Set OpenRouter key" onClick={() => setShowKeyDialog(false)}>
          <div className="lock-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(92vw,420px)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><path d="M12 2l7 4v6c0 5-3.5 9-7 10-3.5-1-7-5-7-10V6l7-4z" /></svg>
              OpenRouter Free Key
            </h3>
            <p style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55 }}>
              Current key is revoked (401). Add your <b>free</b> key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" style={{ color: 'var(--accent-2)', textDecoration: 'underline' }}>openrouter.ai/keys</a> to enable <b>{OPENROUTER_MODEL}</b> (free). Leave empty to use <b>offline portfolio answers</b> (no network, no 401).
              <br /><span className="muted" style={{ fontSize: 11 }}>Stored in <code>localStorage.openrouter_key</code> only on this device.</span>
            </p>
            <div className="field">
              <label htmlFor="openrouterKeyInput">API Key (sk-or-v1...)</label>
              <input
                id="openrouterKeyInput"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-or-v1-..."
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    try { localStorage.setItem('openrouter_key', tempKey.trim()); if (!tempKey.trim()) localStorage.removeItem('openrouter_key') } catch {}
                    setShowKeyDialog(false)
                    showToast(tempKey.trim() ? 'Key saved — free model will be used' : 'Using offline free mode (no key)')
                  }
                }}
              />
            </div>
            <div className="lock-err" style={{ minHeight: 0, fontSize: 11, color: 'var(--ink-3)' }}>
              {isKeyRevoked(getOpenRouterKey()) ? 'Current: revoked offline mode' : `Current: ${getOpenRouterKey().slice(0, 12)}… live`}
            </div>
            <div className="lock-row">
              <button
                className="btn acc"
                style={{ flex: 1 }}
                onClick={() => {
                  try {
                    const v = tempKey.trim()
                    if (v) localStorage.setItem('openrouter_key', v)
                    else localStorage.removeItem('openrouter_key')
                  } catch {}
                  setShowKeyDialog(false)
                  showToast(tempKey.trim() ? 'Key saved — free model will be used' : 'Using offline free mode (no key)')
                }}
              >
                Save
              </button>
              <button className="btn ghost" onClick={() => setShowKeyDialog(false)}>Cancel</button>
              <button
                className="btn ghost"
                onClick={() => {
                  try { localStorage.removeItem('openrouter_key') } catch {}
                  setTempKey('')
                  setShowKeyDialog(false)
                  showToast('Using offline free mode (no key)')
                }}
              >
                Use offline
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

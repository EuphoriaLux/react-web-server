import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowRight,
  Check,
  Shield,
  Heart,
  Clock,
  Users,
  Menu,
  X,
  Sparkles,
} from 'lucide-react'
import './style.css'

/* ─── Custom SVG illustrations ─── */

function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 520 440" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="gSky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8f7f4" />
          <stop offset="100%" stopColor="#eef3fa" />
        </linearGradient>
        <linearGradient id="gHouseA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f0f5fb" />
        </linearGradient>
        <linearGradient id="gHouseB" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#edf8f5" />
        </linearGradient>
        <linearGradient id="gBridge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0d9488" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#0d9488" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#0d9488" stopOpacity="0.15" />
        </linearGradient>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#0c1f38" floodOpacity="0.1" />
        </filter>
      </defs>

      {/* soft ground */}
      <ellipse cx="260" cy="400" rx="200" ry="18" fill="#dfe8f2" opacity="0.55" />

      {/* left home */}
      <g filter="url(#soft)">
        <path d="M48 210 L110 152 L172 210 Z" fill="#0d9488" opacity="0.9" />
        <rect x="58" y="210" width="104" height="96" rx="10" fill="url(#gHouseA)" stroke="#d5e0ec" />
        <rect x="78" y="232" width="28" height="28" rx="5" fill="#cce8e3" />
        <rect x="114" y="232" width="28" height="28" rx="5" fill="#cce8e3" />
        <rect x="96" y="268" width="28" height="38" rx="5" fill="#0f2744" opacity="0.85" />
      </g>

      {/* right home */}
      <g filter="url(#soft)">
        <path d="M348 210 L410 152 L472 210 Z" fill="#0f766e" opacity="0.85" />
        <rect x="358" y="210" width="104" height="96" rx="10" fill="url(#gHouseB)" stroke="#d5e0ec" />
        <rect x="378" y="232" width="28" height="28" rx="5" fill="#d5f0ea" />
        <rect x="414" y="232" width="28" height="28" rx="5" fill="#d5f0ea" />
        <rect x="396" y="268" width="28" height="38" rx="5" fill="#0f2744" opacity="0.85" />
      </g>

      {/* connecting path */}
      <path
        d="M162 258 C210 220, 310 220, 358 258"
        stroke="url(#gBridge)"
        strokeWidth="18"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M162 258 C210 220, 310 220, 358 258"
        stroke="#0d9488"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="6 8"
        fill="none"
        opacity="0.55"
      />

      {/* center shared node — calendar */}
      <g filter="url(#soft)">
        <rect x="218" y="188" width="84" height="92" rx="16" fill="white" stroke="#d5e0ec" />
        <rect x="218" y="188" width="84" height="26" rx="16" fill="#0d9488" />
        <rect x="218" y="204" width="84" height="10" fill="#0d9488" />
        <circle cx="236" cy="201" r="3.5" fill="white" opacity="0.9" />
        <circle cx="284" cy="201" r="3.5" fill="white" opacity="0.9" />
        {/* calendar dots */}
        <circle cx="236" cy="240" r="4" fill="#0d9488" />
        <circle cx="260" cy="240" r="4" fill="#94a3b8" opacity="0.45" />
        <circle cx="284" cy="240" r="4" fill="#2563eb" />
        <circle cx="236" cy="262" r="4" fill="#94a3b8" opacity="0.45" />
        <circle cx="260" cy="262" r="4" fill="#d97706" />
        <circle cx="284" cy="262" r="4" fill="#94a3b8" opacity="0.45" />
      </g>

      {/* heart badge above calendar */}
      <g transform="translate(248 156)">
        <circle cx="12" cy="12" r="16" fill="#ccfbf1" stroke="#99f6e4" />
        <path
          d="M12 20.5 C12 20.5 5 15.2 5 10.8 C5 8.4 6.8 6.8 9 6.8 C10.4 6.8 11.5 7.5 12 8.5 C12.5 7.5 13.6 6.8 15 6.8 C17.2 6.8 19 8.4 19 10.8 C19 15.2 12 20.5 12 20.5 Z"
          fill="#0d9488"
        />
      </g>

      {/* floating chips */}
      <g filter="url(#soft)">
        <rect x="86" y="118" width="108" height="36" rx="18" fill="white" stroke="#e2eaf3" />
        <circle cx="106" cy="136" r="8" fill="#ccfbf1" />
        <rect x="120" y="130" width="54" height="6" rx="3" fill="#d5e0ec" />
        <rect x="120" y="140" width="36" height="5" rx="2.5" fill="#e8eef5" />
      </g>
      <g filter="url(#soft)">
        <rect x="330" y="118" width="108" height="36" rx="18" fill="white" stroke="#e2eaf3" />
        <circle cx="350" cy="136" r="8" fill="#dbeafe" />
        <rect x="364" y="130" width="54" height="6" rx="3" fill="#d5e0ec" />
        <rect x="364" y="140" width="36" height="5" rx="2.5" fill="#e8eef5" />
      </g>

      {/* small child node under bridge */}
      <g transform="translate(248 300)">
        <circle cx="12" cy="10" r="9" fill="#fde68a" />
        <rect x="4" y="20" width="16" height="14" rx="6" fill="#fbbf24" opacity="0.85" />
      </g>
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="6" y="10" width="36" height="32" rx="8" fill="#ccfbf1" />
      <rect x="6" y="10" width="36" height="10" rx="8" fill="#0d9488" />
      <rect x="6" y="16" width="36" height="4" fill="#0d9488" />
      <circle cx="16" cy="15" r="2" fill="white" />
      <circle cx="32" cy="15" r="2" fill="white" />
      <circle cx="16" cy="30" r="2.5" fill="#0d9488" />
      <circle cx="24" cy="30" r="2.5" fill="#94a3b8" opacity="0.5" />
      <circle cx="32" cy="30" r="2.5" fill="#2563eb" />
      <circle cx="16" cy="36" r="2.5" fill="#94a3b8" opacity="0.5" />
      <circle cx="24" cy="36" r="2.5" fill="#d97706" />
    </svg>
  )
}

function IconWallet() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="6" y="14" width="36" height="24" rx="7" fill="#ccfbf1" />
      <rect x="6" y="14" width="36" height="8" rx="4" fill="#0d9488" opacity="0.9" />
      <rect x="28" y="24" width="14" height="10" rx="3" fill="#0f766e" />
      <circle cx="35" cy="29" r="2" fill="#99f6e4" />
      <path d="M12 12h18a4 4 0 0 1 4 4" stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

function IconMessages() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="6" y="10" width="28" height="20" rx="8" fill="#ccfbf1" />
      <path d="M12 30 L12 36 L18 30" fill="#ccfbf1" />
      <rect x="16" y="18" width="26" height="18" rx="8" fill="#0d9488" />
      <path d="M36 36 L36 42 L30 36" fill="#0d9488" />
      <circle cx="24" cy="27" r="1.8" fill="white" />
      <circle cx="30" cy="27" r="1.8" fill="white" />
      <circle cx="36" cy="27" r="1.8" fill="white" />
    </svg>
  )
}

function IconDocs() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="12" y="6" width="24" height="32" rx="5" fill="#ccfbf1" />
      <rect x="10" y="10" width="24" height="32" rx="5" fill="white" stroke="#d5e0ec" />
      <path d="M28 10h6v6h-6a2 2 0 0 1-2-2v-4z" fill="#0d9488" opacity="0.85" />
      <rect x="16" y="22" width="14" height="2.5" rx="1.2" fill="#94a3b8" opacity="0.55" />
      <rect x="16" y="28" width="12" height="2.5" rx="1.2" fill="#94a3b8" opacity="0.4" />
      <rect x="16" y="34" width="10" height="2.5" rx="1.2" fill="#94a3b8" opacity="0.3" />
      <circle cx="34" cy="34" r="8" fill="#0d9488" />
      <path d="M31 34.5 L33 36.5 L37.5 31.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconHandover() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="12" cy="14" r="5" fill="#fecaca" />
      <circle cx="28" cy="14" r="5" fill="#bfdbfe" />
      <path d="M8 28c0-4 2.5-6 4-6s4 2 4 6" stroke="#f87171" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M24 28c0-4 2.5-6 4-6s4 2 4 6" stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M15 20h10" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" />
    </svg>
  )
}

function IconExpense() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="8" y="10" width="24" height="22" rx="4" fill="#fecaca" />
      <path d="M14 16h12M14 21h12M14 26h8" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <circle cx="28" cy="12" r="7" fill="#fff" stroke="#fecaca" />
      <path d="M28 9v6M25.5 12h5" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function IconEscalate() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M8 12h16a6 6 0 0 1 6 6v2a6 6 0 0 1-6 6H14l-6 5v-5a6 6 0 0 1-0-14z" fill="#fecaca" />
      <path d="M18 18h6M18 22h4" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
      <path d="M30 8l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z" fill="#f87171" />
    </svg>
  )
}

function IconScatter() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="6" y="8" width="14" height="18" rx="2.5" fill="#fecaca" transform="rotate(-8 13 17)" />
      <rect x="16" y="10" width="14" height="18" rx="2.5" fill="#fda4af" transform="rotate(6 23 19)" />
      <rect x="12" y="14" width="14" height="18" rx="2.5" fill="#fff" stroke="#fecaca" />
      <path d="M16 20h6M16 24h5" stroke="#f87171" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

function ValuesArt() {
  return (
    <svg className="values-art" viewBox="0 0 320 220" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="vg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ccfbf1" />
          <stop offset="100%" stopColor="#e0f2fe" />
        </linearGradient>
      </defs>
      <rect x="20" y="30" width="280" height="160" rx="24" fill="url(#vg)" opacity="0.55" />
      {/* two adults + child silhouette group */}
      <g transform="translate(70 55)">
        <circle cx="40" cy="36" r="16" fill="#0d9488" opacity="0.9" />
        <rect x="24" y="54" width="32" height="40" rx="12" fill="#0d9488" opacity="0.75" />
        <circle cx="140" cy="36" r="16" fill="#0f766e" opacity="0.9" />
        <rect x="124" y="54" width="32" height="40" rx="12" fill="#0f766e" opacity="0.75" />
        <circle cx="90" cy="52" r="12" fill="#fbbf24" />
        <rect x="78" y="66" width="24" height="28" rx="10" fill="#f59e0b" opacity="0.9" />
        {/* connecting arc */}
        <path d="M56 40 C70 20, 110 20, 124 40" stroke="#0d9488" strokeWidth="2.5" strokeDasharray="5 6" strokeLinecap="round" opacity="0.5" />
      </g>
      <circle cx="52" cy="48" r="6" fill="#99f6e4" />
      <circle cx="268" cy="170" r="8" fill="#bae6fd" />
      <circle cx="250" cy="50" r="5" fill="#99f6e4" opacity="0.8" />
    </svg>
  )
}

const features = [
  {
    Icon: IconCalendar,
    title: 'Shared calendar',
    text: 'One source of truth for handovers, school events, holidays and medical appointments. Both parents see the same plan.',
  },
  {
    Icon: IconWallet,
    title: 'Transparent expenses',
    text: 'Log costs, attach receipts and settle fairly. Fewer arguments about who paid for what.',
  },
  {
    Icon: IconMessages,
    title: 'Structured messages',
    text: 'Keep conversations focused on the child. Less emotional noise, clearer decisions.',
  },
  {
    Icon: IconDocs,
    title: 'Secure documents',
    text: 'Agreements, school reports, medical records and ID copies — always available to both of you.',
  },
]

const friction = [
  {
    Icon: IconHandover,
    title: 'Missed handovers',
    text: 'Last-minute schedule changes and unclear pickup times create stress for everyone.',
  },
  {
    Icon: IconExpense,
    title: 'Expense disputes',
    text: 'Who paid for school trip, clothes, activities? The spreadsheet never stays current.',
  },
  {
    Icon: IconEscalate,
    title: 'Messages that escalate',
    text: 'Ordinary logistics turn emotional in chat threads with no structure or history.',
  },
  {
    Icon: IconScatter,
    title: 'Scattered papers',
    text: 'Agreements, medical notes and school forms live in inboxes, drives and drawers.',
  },
]

const steps = [
  {
    n: '01',
    title: 'Invite the other parent',
    text: 'Create a shared space. Both of you keep full visibility and equal control.',
  },
  {
    n: '02',
    title: 'Bring your calendar & costs in',
    text: 'Start with what already exists. No need to rebuild everything from scratch.',
  },
  {
    n: '03',
    title: 'Run the logistics together',
    text: 'Decide faster, argue less, and keep the child at the centre of every plan.',
  },
]

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="site">
      <header className={`nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-inner">
          <a className="logo" href="#top" onClick={closeMenu}>
            <span className="logo-mark">
              <Heart size={16} strokeWidth={2.4} />
            </span>
            CoParents
          </a>

          <nav className="nav-links" aria-label="Primary">
            <a href="#problem">The problem</a>
            <a href="#solution">How it helps</a>
            <a href="#how">How it works</a>
          </nav>

          <div className="nav-actions">
            <button className="btn ghost" type="button">
              Sign in
            </button>
            <button className="btn primary" type="button">
              Get early access
            </button>
          </div>

          <button
            className="menu-btn"
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {menuOpen && (
          <div className="mobile-menu">
            <a href="#problem" onClick={closeMenu}>
              The problem
            </a>
            <a href="#solution" onClick={closeMenu}>
              How it helps
            </a>
            <a href="#how" onClick={closeMenu}>
              How it works
            </a>
            <button className="btn primary full" type="button" onClick={closeMenu}>
              Get early access
            </button>
          </div>
        )}
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-bg" aria-hidden="true">
            <div className="orb orb-a" />
            <div className="orb orb-b" />
            <div className="grid-fade" />
          </div>
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow">
                <Sparkles size={13} />
                Built for parents who still share a child
              </div>
              <h1>
                Co-parenting
                <span className="h1-line">without the chaos</span>
              </h1>
              <p className="lead">
                One calm, shared space for schedules, expenses, messages and documents.
                Less friction between you. More clarity for your child.
              </p>
              <div className="hero-cta">
                <button className="btn primary large" type="button">
                  Start your shared space
                  <ArrowRight size={18} />
                </button>
                <a className="btn text" href="#solution">
                  See how it works
                </a>
              </div>
              <div className="hero-trust">
                <span>
                  <Shield size={15} />
                  Private by design
                </span>
                <span>
                  <Users size={15} />
                  Both parents equal
                </span>
                <span>
                  <Clock size={15} />
                  Built for real life
                </span>
              </div>
            </div>

            <div className="hero-visual" aria-hidden="true">
              <HeroArt />
            </div>
          </div>
        </section>

        <section className="section problem" id="problem">
          <div className="container">
            <div className="problem-head">
              <div className="section-label">The friction</div>
              <h2>
                Separation is hard enough.
                <br />
                Logistics shouldn’t make it worse.
              </h2>
              <p className="section-lead">
                When two households raise the same child, small gaps in information
                quickly become conflict. CoParents is designed to close those gaps.
              </p>
            </div>
            <div className="friction-grid">
              {friction.map(({ Icon, title, text }) => (
                <article className="friction-card" key={title}>
                  <div className="friction-icon custom">
                    <Icon />
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section solution" id="solution">
          <div className="container">
            <div className="section-header center">
              <div className="section-label">The space</div>
              <h2>
                Everything you both need,
                <br />
                in one shared place
              </h2>
              <p className="section-lead">
                Not another chat thread. Not another spreadsheet.
                A focused toolkit that keeps decisions calm and visible.
              </p>
            </div>

            <div className="feature-grid">
              {features.map(({ Icon, title, text }, i) => (
                <article className="feature" key={title}>
                  <div className="feature-top">
                    <div className="feature-icon custom">
                      <Icon />
                    </div>
                    <span className="feature-n">0{i + 1}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section how" id="how">
          <div className="container">
            <div className="section-header center">
              <div className="section-label">Getting started</div>
              <h2>Simple by design</h2>
              <p className="section-lead">
                No complex setup. Just the essentials both of you can trust.
              </p>
            </div>

            <div className="steps">
              {steps.map((s, i) => (
                <article className="step" key={s.n}>
                  <div className="step-rail">
                    <span className="step-n">{s.n}</span>
                    {i < steps.length - 1 && <span className="step-line" />}
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section values">
          <div className="container values-panel">
            <div className="values-copy">
              <div className="section-label">Principles</div>
              <h2>
                Built around the child,
                <br />
                not the conflict
              </h2>
              <p>
                CoParents is intentionally calm. Structure reduces emotional load
                so conversations stay practical and fair.
              </p>
              <div className="values-art-wrap">
                <ValuesArt />
              </div>
            </div>
            <ul className="value-list">
              <li>
                <span className="value-check">
                  <Check size={16} />
                </span>
                <div>
                  <strong>Equal access</strong>
                  <span>Both parents see the same information. No one is locked out.</span>
                </div>
              </li>
              <li>
                <span className="value-check">
                  <Check size={16} />
                </span>
                <div>
                  <strong>Calm by default</strong>
                  <span>Structure reduces emotional load so conversations stay practical.</span>
                </div>
              </li>
              <li>
                <span className="value-check">
                  <Check size={16} />
                </span>
                <div>
                  <strong>Privacy first</strong>
                  <span>Your family data stays private. Designed for real life, not surveillance.</span>
                </div>
              </li>
            </ul>
          </div>
        </section>

        <section className="section cta">
          <div className="container">
            <div className="cta-box">
              <div className="cta-glow" aria-hidden="true" />
              <h2>Ready to lower the temperature?</h2>
              <p>
                Create a shared space that keeps logistics clear and the focus
                where it belongs — on your child.
              </p>
              <button className="btn primary large light" type="button">
                Get early access
                <ArrowRight size={18} />
              </button>
              <p className="cta-note">No credit card. Private beta starting soon.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <span className="logo-mark small">
              <Heart size={13} strokeWidth={2.4} />
            </span>
            CoParents
          </div>
          <p>Less friction. More clarity. Better for the kids.</p>
          <span className="footer-meta">© {new Date().getFullYear()} CoParents · Concept preview</span>
        </div>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

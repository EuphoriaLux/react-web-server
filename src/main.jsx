import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import {
  CalendarDays,
  Wallet,
  MessageSquare,
  FolderLock,
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

const features = [
  {
    icon: CalendarDays,
    title: 'Shared calendar',
    text: 'One source of truth for handovers, school events, holidays and medical appointments. Both parents see the same plan.',
  },
  {
    icon: Wallet,
    title: 'Transparent expenses',
    text: 'Log costs, attach receipts and settle fairly. Fewer arguments about who paid for what.',
  },
  {
    icon: MessageSquare,
    title: 'Structured messages',
    text: 'Keep conversations focused on the child. Less emotional noise, clearer decisions.',
  },
  {
    icon: FolderLock,
    title: 'Secure documents',
    text: 'Agreements, school reports, medical records and ID copies — always available to both of you.',
  },
]

const friction = [
  'Missed handovers and last-minute schedule changes',
  'Disputes over expenses and who paid last',
  'Messages that turn into arguments',
  'Important papers scattered across emails and folders',
]

const steps = [
  {
    n: '01',
    title: 'Invite the other parent',
    text: 'Create a shared space. Both of you keep full visibility and control.',
  },
  {
    n: '02',
    title: 'Bring your calendar & costs in',
    text: 'Start with what already exists. No need to rebuild everything from scratch.',
  },
  {
    n: '03',
    title: 'Run the logistics together',
    text: 'Decide faster, argue less, and keep the child at the centre.',
  },
]

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
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
              <Heart size={18} strokeWidth={2.2} />
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
        {/* HERO */}
        <section className="hero">
          <div className="hero-bg" aria-hidden="true" />
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow">
                <Sparkles size={14} />
                Built for parents who still share a child
              </div>
              <h1>
                Co-parenting
                <br />
                without the chaos
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
              <div className="card stack-card">
                <div className="card-head">
                  <CalendarDays size={18} />
                  <span>This week</span>
                </div>
                <div className="event">
                  <span className="dot teal" />
                  <div>
                    <strong>School pickup</strong>
                    <small>Thu · 15:30 · Parent A</small>
                  </div>
                </div>
                <div className="event">
                  <span className="dot amber" />
                  <div>
                    <strong>Handover</strong>
                    <small>Fri · 18:00 · Parent B</small>
                  </div>
                </div>
                <div className="event">
                  <span className="dot blue" />
                  <div>
                    <strong>Doctor appointment</strong>
                    <small>Mon · 10:15 · Both notified</small>
                  </div>
                </div>
              </div>

              <div className="card expense-card">
                <div className="card-head">
                  <Wallet size={18} />
                  <span>Shared expenses</span>
                </div>
                <div className="expense-row">
                  <span>School trip</span>
                  <strong>€84.00</strong>
                </div>
                <div className="expense-row">
                  <span>Swimming lessons</span>
                  <strong>€45.00</strong>
                </div>
                <div className="expense-balance">
                  <span>Balance this month</span>
                  <strong className="balanced">Settled</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PROBLEM */}
        <section className="section problem" id="problem">
          <div className="container narrow">
            <div className="section-label">The friction</div>
            <h2>Separation is hard enough.
              <br />
              Logistics shouldn’t make it worse.</h2>
            <p className="section-lead">
              When two households raise the same child, small gaps in information
              quickly become conflict. CoParents is designed to close those gaps.
            </p>
            <ul className="friction-list">
              {friction.map((item) => (
                <li key={item}>
                  <span className="friction-x">×</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* SOLUTION */}
        <section className="section solution" id="solution">
          <div className="container">
            <div className="section-header">
              <div className="section-label">The space</div>
              <h2>Everything you both need,
                <br />
                in one shared place</h2>
              <p className="section-lead">
                Not another chat thread. Not another spreadsheet.
                A focused toolkit that keeps decisions calm and visible.
              </p>
            </div>

            <div className="feature-grid">
              {features.map(({ icon: Icon, title, text }) => (
                <article className="feature" key={title}>
                  <div className="feature-icon">
                    <Icon size={22} strokeWidth={1.8} />
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="section how" id="how">
          <div className="container">
            <div className="section-header">
              <div className="section-label">Getting started</div>
              <h2>Simple by design</h2>
              <p className="section-lead">
                No complex setup. Just the essentials both of you can trust.
              </p>
            </div>

            <div className="steps">
              {steps.map((s) => (
                <article className="step" key={s.n}>
                  <span className="step-n">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* VALUES */}
        <section className="section values">
          <div className="container values-grid">
            <div>
              <div className="section-label">Principles</div>
              <h2>Built around the child,
                <br />
                not the conflict</h2>
            </div>
            <ul className="value-list">
              <li>
                <Check size={18} />
                <div>
                  <strong>Equal access</strong>
                  <span>Both parents see the same information. No one is locked out.</span>
                </div>
              </li>
              <li>
                <Check size={18} />
                <div>
                  <strong>Calm by default</strong>
                  <span>Structure reduces emotional load so conversations stay practical.</span>
                </div>
              </li>
              <li>
                <Check size={18} />
                <div>
                  <strong>Privacy first</strong>
                  <span>Your family data stays private. Designed for real life, not surveillance.</span>
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="section cta">
          <div className="container cta-box">
            <h2>Ready to lower the temperature?</h2>
            <p>
              Create a shared space that keeps logistics clear and the focus
              where it belongs — on your child.
            </p>
            <button className="btn primary large" type="button">
              Get early access
              <ArrowRight size={18} />
            </button>
            <p className="cta-note">No credit card. Private beta starting soon.</p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <span className="logo-mark small">
              <Heart size={14} strokeWidth={2.2} />
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

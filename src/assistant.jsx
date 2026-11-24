import React, { useState } from 'react'
import { useLang } from './main.jsx'

// "Add CoParents to your AI assistant": the connector address to copy, a button
// that opens Claude's connector settings, and short steps. See docs/assistants.md.
export const MCP_ADDRESS = 'https://coparent.lu/api/mcp'
const CLAUDE_CONNECTORS = 'https://claude.ai/settings/connectors'

export const ASSISTANT_COPY = {
  en: {
    label: 'AI assistant',
    title: 'Add CoParents to your AI assistant',
    lead: 'Connect Claude or ChatGPT to your plan. Then just say “I paid €42 for school shoes, split 50/50” or “help me set up CoParents”, and it fills it in for you. It always asks before saving, and it can’t delete anything.',
    copy: 'Copy address', copied: 'Copied',
    claude: 'Open Claude connectors',
    stepsTitle: 'How',
    claudeSteps: 'Claude: open Settings › Connectors › Add custom connector, paste the address, then sign in with your CoParents email and click Allow.',
    chatgptSteps: 'ChatGPT: in Settings, turn on developer mode, add a connector with the address, and sign in the same way.',
    privacy: 'What the assistant reads goes to its company (Anthropic or OpenAI) under your own account with them.',
  },
  fr: {
    label: 'Assistant IA',
    title: 'Ajoutez CoParents à votre assistant IA',
    lead: 'Connectez Claude ou ChatGPT à votre planning. Dites simplement « J’ai payé 42\u00a0€ de chaussures d’école, moitié-moitié » ou « aide-moi à configurer CoParents », et il le remplit pour vous. Il demande toujours avant d’enregistrer et ne peut rien supprimer.',
    copy: 'Copier l’adresse', copied: 'Copié',
    claude: 'Ouvrir les connecteurs Claude',
    stepsTitle: 'Comment',
    claudeSteps: 'Claude : ouvrez Paramètres › Connecteurs › Ajouter un connecteur personnalisé, collez l’adresse, puis connectez-vous avec votre e-mail CoParents et cliquez sur Autoriser.',
    chatgptSteps: 'ChatGPT : dans les Paramètres, activez le mode développeur, ajoutez un connecteur avec l’adresse et connectez-vous de la même façon.',
    privacy: 'Ce que l’assistant lit part chez son éditeur (Anthropic ou OpenAI), sous votre propre compte chez eux.',
  },
  de: {
    label: 'KI-Assistent',
    title: 'CoParents zu deinem KI-Assistenten hinzufügen',
    lead: 'Verbinde Claude oder ChatGPT mit deinem Plan. Sag einfach „Ich habe 42 € für Schulschuhe bezahlt, halbe-halbe“ oder „hilf mir, CoParents einzurichten“, und er trägt es für dich ein. Er fragt immer vor dem Speichern und kann nichts löschen.',
    copy: 'Adresse kopieren', copied: 'Kopiert',
    claude: 'Claude-Connectors öffnen',
    stepsTitle: 'So geht’s',
    claudeSteps: 'Claude: Einstellungen › Connectors › Eigenen Connector hinzufügen, Adresse einfügen, dann mit deiner CoParents-E-Mail anmelden und auf Erlauben tippen.',
    chatgptSteps: 'ChatGPT: in den Einstellungen den Entwicklermodus einschalten, einen Connector mit der Adresse hinzufügen und genauso anmelden.',
    privacy: 'Was der Assistent liest, geht an seinen Anbieter (Anthropic oder OpenAI), unter deinem eigenen Konto dort.',
  },
  lb: {
    label: 'KI-Assistent',
    title: 'CoParents bei däin KI-Assistent derbäisetzen',
    lead: 'Verbann Claude oder ChatGPT mat dengem Plang. So einfach „Ech hu 42 € fir Schoulschong bezuelt, hallef-hallef“ oder „hëllef mir, CoParents anzeriichten“, an hie fëllt et fir dech aus. Hie freet ëmmer, ier e späichert, a ka näischt läschen.',
    copy: 'Adress kopéieren', copied: 'Kopéiert',
    claude: 'Claude-Connectoren opmaachen',
    stepsTitle: 'Wéi',
    claudeSteps: 'Claude: Astellungen › Connectors › Eegene Connector derbäisetzen, d’Adress apechen, dann mat denger CoParents-E-Mail umellen an op Erlaben tippen.',
    chatgptSteps: 'ChatGPT: an den Astellungen den Entwécklermodus aschalten, e Connector mat der Adress derbäisetzen an esou umellen.',
    privacy: 'Wat den Assistent liest, geet bei säin Ubidder (Anthropic oder OpenAI), ënner dengem eegene Kont do.',
  },
}

export function useAssistantCopy() {
  const { lang } = useLang()
  return ASSISTANT_COPY[lang] || ASSISTANT_COPY.en
}

export function AssistantCard({ landing = false }) {
  const c = useAssistantCopy()
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(MCP_ADDRESS)
    } catch {
      // Older browsers: select the address so the parent can copy it by hand.
      const field = document.getElementById(landing ? 'mcp-address-landing' : 'mcp-address')
      field?.select()
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <article className={`assistant-card${landing ? ' landing' : ''}`}>
      {!landing && <span className="assistant-label">{c.label}</span>}
      {!landing && <h3>{c.title}</h3>}
      <p className="assistant-lead">{c.lead}</p>
      <div className="assistant-address">
        <input id={landing ? 'mcp-address-landing' : 'mcp-address'} readOnly value={MCP_ADDRESS} onFocus={(e) => e.target.select()} aria-label={c.title} />
        <button type="button" className="btn primary sm" onClick={copy}>{copied ? c.copied : c.copy}</button>
      </div>
      <a className="btn ghost sm assistant-claude" href={CLAUDE_CONNECTORS} target="_blank" rel="noopener noreferrer">{c.claude} ↗</a>
      <details className="assistant-steps">
        <summary>{c.stepsTitle}</summary>
        <p>{c.claudeSteps}</p>
        <p>{c.chatgptSteps}</p>
        <p className="assistant-privacy">{c.privacy}</p>
      </details>
    </article>
  )
}

import React, {
  useEffect,
  useRef,
  useState,
  useCallback
} from 'react';
import { animate, createTimeline } from 'animejs';
import styles from './DDOChatbot.module.css';

const CHAT_URL = '/.netlify/functions/ddoChat';
const MAX_HISTORY_TURNS = 10;

const INITIAL_GREETING = {
  role: 'assistant',
  content:
    "Hey adventurer. I'm the DDO Codex Assistant — ask me anything about Dungeons & Dragons Online: builds, gear, quests, mechanics, set bonuses, you name it."
};

export default function DDOChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([INITIAL_GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const fabRef = useRef(null);
  const fabIconRef = useRef(null);
  const panelRef = useRef(null);
  const messagesRef = useRef(null);
  const inputRef = useRef(null);
  const idleTimelineRef = useRef(null);

  // ── Idle pulse animation on the FAB (runs continuously while closed) ──
  useEffect(() => {
    if (!fabRef.current) return;

    if (open) {
      // Pause idle pulse while panel is open
      if (idleTimelineRef.current) {
        idleTimelineRef.current.pause();
      }
      return;
    }

    const tl = createTimeline({
      loop: true,
      defaults: { ease: 'inOutSine' }
    });

    tl.add(fabRef.current, {
      scale: [1, 1.06, 1],
      boxShadow: [
        '0 6px 20px rgba(124, 106, 247, 0.35)',
        '0 8px 28px rgba(124, 106, 247, 0.65)',
        '0 6px 20px rgba(124, 106, 247, 0.35)'
      ],
      duration: 2200
    });

    if (fabIconRef.current) {
      tl.add(
        fabIconRef.current,
        {
          rotate: [0, 8, -8, 0],
          duration: 2200
        },
        0 // start at the same time as the scale tween
      );
    }

    idleTimelineRef.current = tl;

    return () => {
      tl.pause();
      idleTimelineRef.current = null;
    };
  }, [open]);

  // ── Hover bounce on the FAB ──
  const handleFabEnter = useCallback(() => {
    if (!fabRef.current || open) return;
    animate(fabRef.current, {
      scale: 1.12,
      duration: 220,
      ease: 'outBack(1.6)'
    });
  }, [open]);

  const handleFabLeave = useCallback(() => {
    if (!fabRef.current || open) return;
    animate(fabRef.current, {
      scale: 1,
      duration: 260,
      ease: 'outQuad'
    });
  }, [open]);

  // ── Click: rotate icon + open/close panel ──
  const togglePanel = useCallback(() => {
    if (fabIconRef.current) {
      animate(fabIconRef.current, {
        rotate: open ? '-=180' : '+=180',
        duration: 380,
        ease: 'outBack(1.6)'
      });
    }
    if (fabRef.current) {
      animate(fabRef.current, {
        scale: [1, 0.9, 1],
        duration: 320,
        ease: 'inOutQuad'
      });
    }
    setOpen(prev => !prev);
  }, [open]);

  // ── Animate panel in/out ──
  useEffect(() => {
    if (!panelRef.current) return;

    if (open) {
      animate(panelRef.current, {
        opacity: [0, 1],
        translateY: [16, 0],
        scale: [0.96, 1],
        duration: 280,
        ease: 'outCubic'
      });
      // focus the input shortly after the panel opens
      const t = setTimeout(() => inputRef.current?.focus(), 320);
      return () => clearTimeout(t);
    } else {
      animate(panelRef.current, {
        opacity: [1, 0],
        translateY: [0, 16],
        scale: [1, 0.96],
        duration: 200,
        ease: 'inCubic'
      });
    }
  }, [open]);

  // ── Auto-scroll messages on new content ──
  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, sending]);

  // ── Send a message ──
  const sendMessage = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      setError(null);
      setInput('');
      setSending(true);

      // Build history payload from prior turns (skip the local greeting)
      const priorTurns = messages
        .filter((m, idx) => !(idx === 0 && m === INITIAL_GREETING))
        .slice(-MAX_HISTORY_TURNS);

      const userMsg = { role: 'user', content: trimmed };
      setMessages(prev => [...prev, userMsg]);

      try {
        const res = await fetch(CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            history: priorTurns
          })
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || `Server error ${res.status}`);
        }

        const reply = data.reply || 'No response.';
        setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      } catch (err) {
        setError(err.message);
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: "Something went wrong on my end. Try again in a moment.",
            isError: true
          }
        ]);
      } finally {
        setSending(false);
      }
    },
    [messages, sending]
  );

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(e) {
    // Submit on Enter, allow Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className={styles.root} aria-live="polite">
      {/* ── Chat panel ── */}
      <div
        ref={panelRef}
        className={`${styles.panel} ${open ? styles.panelOpen : ''}`}
        role="dialog"
        aria-label="DDO Codex chatbot"
        aria-hidden={!open}
      >
        <header className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <span className={styles.panelDot} aria-hidden="true" />
            DDO Codex Assistant
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={togglePanel}
            aria-label="Close chat"
          >
            ×
          </button>
        </header>

        <div ref={messagesRef} className={styles.messages}>
          {messages.map((m, i) => (
            <div
              key={i}
              className={`${styles.message} ${
                m.role === 'user' ? styles.userMsg : styles.botMsg
              } ${m.isError ? styles.errorMsg : ''}`}
            >
              {m.content}
            </div>
          ))}

          {sending && (
            <div className={`${styles.message} ${styles.botMsg} ${styles.typing}`}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          )}
        </div>

        {error && (
          <div className={styles.errorBar} role="alert">
            {error}
          </div>
        )}

        <form className={styles.inputRow} onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about DDO…"
            rows={1}
            disabled={sending}
            aria-label="Chat message"
          />
          <button
            type="submit"
            className={styles.sendBtn}
            disabled={!input.trim() || sending}
            aria-label="Send message"
          >
            {sending ? '…' : '➤'}
          </button>
        </form>
      </div>

      {/* ── Floating action button ── */}
      <button
        ref={fabRef}
        type="button"
        className={styles.fab}
        onClick={togglePanel}
        onMouseEnter={handleFabEnter}
        onMouseLeave={handleFabLeave}
        aria-label={open ? 'Close DDO chatbot' : 'Open DDO chatbot'}
        aria-expanded={open}
      >
        <span ref={fabIconRef} className={styles.fabIcon} aria-hidden="true">
          {open ? '×' : '✦'}
        </span>
      </button>
    </div>
  );
}

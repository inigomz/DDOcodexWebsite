import React from 'react';
import styles from './AdvisorReport.module.css';

// Renders markdown-like advisor text with basic heading/bold support.
function renderAdvice(text) {
  if (!text) return null;

  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) {
      return <h3 key={i} className={styles.h3}>{line.slice(3)}</h3>;
    }
    if (line.startsWith('# ')) {
      return <h2 key={i} className={styles.h2}>{line.slice(2)}</h2>;
    }
    if (line.startsWith('### ')) {
      return <h4 key={i} className={styles.h4}>{line.slice(4)}</h4>;
    }
    if (line.trim() === '') {
      return <div key={i} className={styles.spacer} />;
    }
    // Render **bold** inline
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className={styles.para}>
        {parts.map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j}>{part.slice(2, -2)}</strong>
            : part
        )}
      </p>
    );
  });
}

export default function AdvisorReport({ advice }) {
  return (
    <section className={styles.section} aria-label="AI advisor report">
      <div className={styles.header}>
        <span className={styles.icon} aria-hidden="true">✦</span>
        <h2 className={styles.heading}>AI Advisor Report</h2>
      </div>
      <div className={styles.body}>
        {renderAdvice(advice)}
      </div>
    </section>
  );
}

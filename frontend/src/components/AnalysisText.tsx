const HIGHLIGHT_RE = new RegExp(
  [
    /\bB\d+\b/,                           // batch names: B1, B2, B3
    /\d+(?:\.\d+)?%/,                     // percentages: 20.4%
    /pH\s+\d+\.\d+/,                      // pH values: pH 6.91
    /\d+(?:\.\d+)?°C/,                    // temperatures: 40°C
    /\d+(?:\.\d+)?\s*mg\/mL/,            // concentrations: 0.425 mg/mL
    /\d+:\d+\s+lipid/i,                   // lipid ratio: 3:1 lipid
    /\b\d+-hour\b/,                        // incubation: 8-hour
    /±\d+(?:\.\d+)?/,                     // std dev: ±4.4
    /\b\d+\.\d+\s+standard\s+deviations?\b/i,
    /\btop\s+performer\b/i,
    /\boptimal\s+(?:condition|parameter|performance|result)s?\b/i,
    /\bconvergence\b/i,
    /\btransfection\s+efficiency\b/i,
    /\bBayesian\s+optimization\b/i,
  ]
    .map((r) => r.source)
    .join('|'),
  'gi'
);

function renderHighlighted(text: string) {
  const parts: { text: string; highlight: boolean }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(HIGHLIGHT_RE.source, 'gi');

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), highlight: false });
    }
    parts.push({ text: match[0], highlight: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }

  return parts.map((part, i) =>
    part.highlight ? (
      <span key={i} style={{ color: '#c8a96e', fontWeight: 400 }}>
        {part.text}
      </span>
    ) : (
      <span key={i}>{part.text}</span>
    )
  );
}

export default function AnalysisText({
  text,
  isLoading,
}: {
  text: string | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[100, 90, 75].map((w) => (
          <div
            key={w}
            className="h-3 bg-surface-border rounded animate-pulse"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    );
  }

  if (!text) return null;

  return (
    <p
      className="font-light leading-[1.85]"
      style={{ color: 'rgba(255,255,255,0.6)', fontSize: '15px' }}
    >
      {renderHighlighted(text)}
    </p>
  );
}

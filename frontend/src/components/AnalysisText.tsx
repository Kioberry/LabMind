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
    <p className="text-secondary text-sm font-light leading-relaxed">{text}</p>
  );
}

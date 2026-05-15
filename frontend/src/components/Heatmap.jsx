const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Heatmap({ data }) {
  if (!Array.isArray(data) || data.length !== 7) {
    return <div className="placeholder">No data</div>;
  }
  const max = Math.max(1, ...data.flat());

  return (
    <div className="heatmap" role="table" aria-label="Activity heatmap">
      <div className="heatmap-row heatmap-head">
        <span className="heatmap-day" />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="heatmap-hour-label">
            {h % 6 === 0 ? h : ""}
          </span>
        ))}
      </div>
      {data.map((row, dow) => (
        <div key={dow} className="heatmap-row">
          <span className="heatmap-day">{DAYS[dow]}</span>
          {row.map((count, hour) => {
            const ratio = count / max;
            const opacity = count === 0 ? 0.08 : 0.15 + 0.85 * ratio;
            return (
              <span
                key={hour}
                className="heatmap-cell"
                style={{ opacity }}
                title={`${DAYS[dow]} ${hour}:00 — ${count} message${count === 1 ? "" : "s"}`}
              />
            );
          })}
        </div>
      ))}
      <div className="heatmap-legend">
        <span>less</span>
        <span className="heatmap-cell" style={{ opacity: 0.15 }} />
        <span className="heatmap-cell" style={{ opacity: 0.4 }} />
        <span className="heatmap-cell" style={{ opacity: 0.7 }} />
        <span className="heatmap-cell" style={{ opacity: 1 }} />
        <span>more</span>
      </div>
    </div>
  );
}

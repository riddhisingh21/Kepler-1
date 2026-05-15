import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api.js";

function f1Color(f1) {
  if (f1 >= 0.9) return "#10b981";
  if (f1 >= 0.75) return "#22d3ee";
  if (f1 >= 0.5) return "#f59e0b";
  return "#ef4444";
}

export default function ModelHealth() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .evaluate()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="analytics placeholder">Running cross-validation…</div>;
  if (error) return <div className="analytics placeholder">Error: {error}</div>;
  if (!data) return null;

  const overall = data.overall || {};
  const rows = data.per_intent || [];
  const chartData = rows.map((r) => ({ ...r, color: f1Color(r.f1) }));

  return (
    <div className="analytics">
      <div className="stat-grid">
        <StatCard label="Samples" value={data.num_samples} />
        <StatCard label="Intents" value={data.num_intents} />
        <StatCard
          label="Accuracy"
          value={
            typeof overall.accuracy === "number"
              ? `${(overall.accuracy * 100).toFixed(1)}%`
              : "—"
          }
        />
        <StatCard
          label="Macro F1"
          value={
            typeof overall.macro_f1 === "number"
              ? overall.macro_f1.toFixed(3)
              : "—"
          }
        />
      </div>

      {data.warning && (
        <div className="analytics-panel">
          <p style={{ color: "var(--muted)" }}>{data.warning}</p>
        </div>
      )}

      <div className="analytics-panel">
        <div className="panel-head">
          <h3>Per-intent F1 (5-fold CV)</h3>
          <button className="ghost" onClick={load}>Re-run</button>
        </div>
        {rows.length === 0 ? (
          <div className="placeholder">No metrics available.</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 28)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  domain={[0, 1]}
                  stroke="var(--muted)"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  dataKey="tag"
                  type="category"
                  stroke="var(--muted)"
                  tick={{ fontSize: 11 }}
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--tooltip-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--text)",
                  }}
                  formatter={(v) => v.toFixed(3)}
                />
                <Bar dataKey="f1" radius={[0, 6, 6, 0]}>
                  {chartData.map((row, i) => (
                    <Cell key={i} fill={row.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <table className="low-conf-table">
              <thead>
                <tr>
                  <th>Intent</th>
                  <th>Precision</th>
                  <th>Recall</th>
                  <th>F1</th>
                  <th>Support</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tag}>
                    <td><code>{r.tag}</code></td>
                    <td>{r.precision.toFixed(3)}</td>
                    <td>{r.recall.toFixed(3)}</td>
                    <td style={{ color: f1Color(r.f1) }}>{r.f1.toFixed(3)}</td>
                    <td>{r.support}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

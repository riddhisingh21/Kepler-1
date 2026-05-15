import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api.js";
import Heatmap from "./Heatmap.jsx";

const INTENT_COLORS = [
  "#6366f1", "#22d3ee", "#a855f7", "#f59e0b", "#10b981",
  "#ef4444", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6",
];

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.analytics()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="analytics placeholder">Loading analytics…</div>;
  if (error) return <div className="analytics placeholder">Error: {error}</div>;
  if (!data) return null;

  const topIntents = data.intents.slice(0, 8);
  const avgSent =
    typeof data.avg_sentiment === "number" ? data.avg_sentiment : 0;

  return (
    <div className="analytics">
      <div className="stat-grid">
        <StatCard label="Messages" value={data.total_messages} />
        <StatCard
          label="Avg confidence"
          value={`${Math.round(data.avg_confidence * 100)}%`}
        />
        <StatCard
          label="Avg sentiment"
          value={avgSent > 0 ? `+${avgSent.toFixed(2)}` : avgSent.toFixed(2)}
        />
        <StatCard label="Intents seen" value={data.intents.length} />
        <StatCard label="Feedback" value={data.num_feedback} />
      </div>

      <Panel title="Top intents">
        {topIntents.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topIntents}>
              <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
              <XAxis dataKey="intent" stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#1e293b" }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {topIntents.map((_, i) => (
                  <Cell key={i} fill={INTENT_COLORS[i % INTENT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Confidence distribution">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.confidence_buckets}>
            <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
            <XAxis dataKey="bucket" stroke="#94a3b8" tick={{ fontSize: 11 }} />
            <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#1e293b" }} />
            <Bar dataKey="count" fill="#22d3ee" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Messages per day (last 14)">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data.daily}>
            <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
            <XAxis dataKey="day" stroke="#94a3b8" tick={{ fontSize: 10 }} />
            <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 3, fill: "#6366f1" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      {Array.isArray(data.sentiment_daily) && (
        <Panel title="Sentiment per day (last 14)">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.sentiment_daily}>
              <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
              <XAxis dataKey="day" stroke="#94a3b8" tick={{ fontSize: 10 }} />
              <YAxis
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                domain={[-1, 1]}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v) => v.toFixed(2)}
              />
              <Line
                type="monotone"
                dataKey="avg_sentiment"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3, fill: "#10b981" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}

      <Panel title="Activity heatmap (day × hour)">
        <Heatmap data={data.heatmap} />
      </Panel>

      <Panel
        title={`Recent low-confidence queries${
          data.threshold ? ` (< ${Math.round(data.threshold * 100)}%)` : ""
        }`}
      >
        {!data.low_confidence?.length ? (
          <Empty />
        ) : (
          <table className="low-conf-table">
            <thead>
              <tr><th>Query</th><th>Predicted</th><th>Confidence</th><th>When</th></tr>
            </thead>
            <tbody>
              {data.low_confidence.map((row) => (
                <tr key={row.id}>
                  <td className="lc-query">{row.user_text}</td>
                  <td><code>{row.intent || "—"}</code></td>
                  <td>{Math.round(row.confidence * 100)}%</td>
                  <td className="lc-time">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

const tooltipStyle = {
  background: "#111c34",
  border: "1px solid #1f2a44",
  borderRadius: 8,
  color: "#e2e8f0",
};

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="analytics-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Empty() {
  return <div className="placeholder">No messages yet — say hi in the chat tab.</div>;
}

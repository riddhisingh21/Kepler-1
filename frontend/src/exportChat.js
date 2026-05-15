function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toMarkdown(messages, sessionId) {
  const lines = [
    `# Kepler 1 conversation`,
    ``,
    `- session: \`${sessionId}\``,
    `- exported: ${new Date().toISOString()}`,
    `- messages: ${messages.length}`,
    ``,
    `---`,
    ``,
  ];
  for (const m of messages) {
    if (m.role === "user") {
      lines.push(`**You:** ${m.text}`);
    } else if (m.role === "bot") {
      const meta = [];
      if (m.intent) meta.push(`intent: \`${m.intent}\``);
      if (typeof m.confidence === "number") {
        meta.push(`confidence: ${(m.confidence * 100).toFixed(0)}%`);
      }
      lines.push(`**Bot:** ${m.text}`);
      if (meta.length) lines.push(`_${meta.join(" · ")}_`);
    } else {
      lines.push(`> ${m.text}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function toJSON(messages, sessionId) {
  return JSON.stringify(
    {
      session_id: sessionId,
      exported_at: new Date().toISOString(),
      messages: messages.map((m) => ({
        role: m.role,
        text: m.text,
        intent: m.intent ?? null,
        confidence: m.confidence ?? null,
        sentiment: m.sentiment ?? null,
        latency_ms: m.latencyMs ?? null,
      })),
    },
    null,
    2,
  );
}

export function exportChat(messages, sessionId, format = "markdown") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  if (format === "json") {
    download(
      `kepler-${stamp}.json`,
      toJSON(messages, sessionId),
      "application/json",
    );
  } else {
    download(
      `kepler-${stamp}.md`,
      toMarkdown(messages, sessionId),
      "text/markdown",
    );
  }
}

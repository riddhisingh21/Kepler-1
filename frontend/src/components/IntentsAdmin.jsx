import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast } from "../Toast.jsx";

const EMPTY_DRAFT = { tag: "", patterns: "", responses: "" };

export default function IntentsAdmin({ onStatsRefresh }) {
  const toast = useToast();
  const [intents, setIntents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // tag being edited, or "__new__"
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [training, setTraining] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.intents();
      setIntents(list);
    } catch (err) {
      toast.error(`Could not load intents: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { refresh(); }, [refresh]);

  async function openEdit(tag) {
    try {
      const detail = await api.intentDetail(tag);
      setDraft({
        tag: detail.tag,
        patterns: detail.patterns.join("\n"),
        responses: detail.responses.join("\n"),
      });
      setEditing(tag);
    } catch (err) {
      toast.error(`Load failed: ${err.message}`);
    }
  }

  function openNew() {
    setDraft(EMPTY_DRAFT);
    setEditing("__new__");
  }

  function closeForm() {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
  }

  async function save() {
    const payload = {
      tag: draft.tag.trim(),
      patterns: draft.patterns.split("\n").map((s) => s.trim()).filter(Boolean),
      responses: draft.responses.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    if (!payload.tag || !payload.patterns.length || !payload.responses.length) {
      toast.error("Tag, patterns and responses are all required.");
      return;
    }
    setBusy(true);
    try {
      if (editing === "__new__") {
        await api.createIntent(payload);
        toast.success(`Created intent ${payload.tag}`);
      } else {
        await api.updateIntent(editing, payload);
        toast.success(`Updated intent ${payload.tag}`);
      }
      closeForm();
      await refresh();
    } catch (err) {
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(tag) {
    if (!window.confirm(`Delete intent "${tag}"?`)) return;
    setBusy(true);
    try {
      await api.deleteIntent(tag);
      toast.success(`Deleted ${tag}`);
      await refresh();
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function retrain() {
    setTraining(true);
    try {
      const stats = await api.train();
      toast.success(
        `Trained · ${stats.num_samples} samples · ${stats.num_intents} intents`,
      );
      try {
        const fresh = await api.stats();
        onStatsRefresh?.(fresh);
      } catch (_) {}
    } catch (err) {
      toast.error(`Training failed: ${err.message}`);
    } finally {
      setTraining(false);
    }
  }

  return (
    <div className="intents-admin">
      <div className="intents-toolbar">
        <h3>Intents</h3>
        <div className="intents-actions">
          <button className="ghost" onClick={openNew} disabled={busy}>+ New intent</button>
          <button
            className="primary retrain-btn"
            onClick={retrain}
            disabled={training}
          >
            {training ? <span className="spinner" /> : "↻"} Retrain model
          </button>
        </div>
      </div>

      {loading ? (
        <div className="placeholder">Loading…</div>
      ) : (
        <table className="intents-table">
          <thead>
            <tr><th>Tag</th><th>Patterns</th><th>Responses</th><th /></tr>
          </thead>
          <tbody>
            {intents.map((i) => (
              <tr key={i.tag}>
                <td><code>{i.tag}</code></td>
                <td>{i.num_patterns}</td>
                <td>{i.num_responses}</td>
                <td className="row-actions">
                  <button className="ghost" onClick={() => openEdit(i.tag)} disabled={busy}>
                    Edit
                  </button>
                  <button
                    className="ghost danger"
                    onClick={() => remove(i.tag)}
                    disabled={busy}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={closeForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header">
              <h3>{editing === "__new__" ? "New intent" : `Edit ${editing}`}</h3>
              <button className="icon-btn" onClick={closeForm} aria-label="Close">×</button>
            </div>
            <label className="field">
              <span>Tag</span>
              <input
                value={draft.tag}
                onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
                disabled={editing !== "__new__"}
                placeholder="e.g. greeting"
              />
            </label>
            <label className="field">
              <span>Patterns (one per line)</span>
              <textarea
                rows={5}
                value={draft.patterns}
                onChange={(e) => setDraft({ ...draft, patterns: e.target.value })}
                placeholder={"hello\nhi there\nhey"}
              />
            </label>
            <label className="field">
              <span>Responses (one per line)</span>
              <textarea
                rows={5}
                value={draft.responses}
                onChange={(e) => setDraft({ ...draft, responses: e.target.value })}
                placeholder={"Hello!\nHi there\nHey, how can I help?"}
              />
            </label>
            <div className="modal-actions">
              <button className="ghost" onClick={closeForm} disabled={busy}>Cancel</button>
              <button className="primary" onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

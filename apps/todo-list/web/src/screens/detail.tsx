import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { type DetailSection, deleteNode, getNode, getUrlParam, toggleComplete } from '../api';
import '../styles.css';

function DetailScreen() {
  const [node, setNode] = useState<Record<string, unknown> | null>(null);
  const [sections, setSections] = useState<DetailSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const nodeId = getUrlParam('nodeId') ?? getUrlParam('id');

  const loadNode = useCallback(async () => {
    if (!nodeId) {
      setError('No nodeId provided. Pass ?nodeId=<id> in the URL.');
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const data = await getNode(nodeId);
      setNode(data);
      // Build sections from the node data
      const builtSections: DetailSection[] = [];

      // Overview
      builtSections.push({
        title: 'Overview',
        fields: [
          { label: 'Title', value: String(data.text ?? ''), type: 'text' },
          { label: 'Description', value: String(data.description ?? '(none)'), type: 'text' },
          { label: 'Completed', value: String(data.completed ?? false), type: 'text' },
          { label: 'Position', value: Number(data.position ?? 0), type: 'text' },
          { label: 'Parent', value: String(data.parentId ?? '(root)'), type: 'text' },
          { label: 'Created', value: String(data.createdAt ?? ''), type: 'date' },
          { label: 'Updated', value: String(data.updatedAt ?? ''), type: 'date' },
        ],
      });

      // Instructions
      if (data.instructions) {
        builtSections.push({
          title: 'Instructions',
          fields: [{ label: 'Instructions', value: String(data.instructions), type: 'markdown' }],
        });
      }

      // Log
      const log = data.log as Array<{ timestamp: string; text: string }> | undefined;
      if (log && log.length > 0) {
        builtSections.push({
          title: `Log (${log.length} entries)`,
          fields: log.map((entry) => ({
            label: new Date(entry.timestamp).toISOString(),
            value: entry.text,
            type: 'text' as const,
          })),
        });
      }

      setSections(builtSections);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    loadNode();
  }, [loadNode]);

  const handleToggleComplete = useCallback(async () => {
    if (!nodeId) return;
    try {
      await toggleComplete(nodeId);
      await loadNode();
    } catch (err) {
      setError(String(err));
    }
  }, [nodeId, loadNode]);

  const handleDelete = useCallback(async () => {
    if (!nodeId) return;
    if (!confirm('Delete this node and all its children?')) return;
    try {
      await deleteNode(nodeId);
      window.close();
    } catch (err) {
      setError(String(err));
    }
  }, [nodeId]);

  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner" />
          Loading node…
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-header">
        <h1>📄 {String(node?.text ?? 'Node Detail')}</h1>
        <div className="actions">
          <button className="btn btn-sm" onClick={loadNode}>
            ↻ Refresh
          </button>
          <button className="btn btn-sm" onClick={handleToggleComplete}>
            ✓ Toggle Complete
          </button>
          <button className="btn btn-sm btn-danger" onClick={handleDelete}>
            🗑 Delete
          </button>
        </div>
      </div>
      <div className="app-body">
        {error && <div className="error-msg">{error}</div>}
        {sections.map((section, i) => (
          <div key={i} className="detail-section-card">
            {section.title && <div className="detail-section-card-title">{section.title}</div>}
            <div className="detail-fields">
              {section.fields.map((field, j) => (
                <div key={j} className="detail-field">
                  <span className="detail-field-label">{field.label}</span>
                  <span className="detail-field-value">
                    {field.type === 'markdown' ? (
                      <pre>{String(field.value)}</pre>
                    ) : field.type === 'code' ? (
                      <code>{String(field.value)}</code>
                    ) : (
                      String(field.value)
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<DetailScreen />);

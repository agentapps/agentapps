import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { addNode, getNode, getUrlParam, updateNode } from '../api';
import '../styles.css';

function FormScreen() {
  const [text, setText] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const nodeId = getUrlParam('nodeId');
  const parentId = getUrlParam('parentId');
  const isEditMode = !!nodeId;

  // Load existing node data in edit mode
  useEffect(() => {
    if (!nodeId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const node = await getNode(nodeId);
        setText(String(node.text ?? ''));
        setDescription(String(node.description ?? ''));
        setInstructions(String(node.instructions ?? ''));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [nodeId]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!text.trim()) {
        setError('Title is required.');
        return;
      }
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      try {
        if (isEditMode && nodeId) {
          await updateNode(nodeId, { text: text.trim(), description, instructions });
          setSuccess('Node updated successfully!');
        } else {
          await addNode(
            text.trim(),
            parentId ?? undefined,
            description || undefined,
            instructions || undefined,
          );
          setSuccess('Node added successfully!');
          // Reset form in add mode
          setText('');
          setDescription('');
          setInstructions('');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [text, description, instructions, isEditMode, nodeId, parentId],
  );

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
        <h1>{isEditMode ? '✏️ Edit Node' : '➕ Add Node'}</h1>
      </div>
      <div className="app-body">
        {error && <div className="error-msg">{error}</div>}
        {success && (
          <div
            style={{
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid var(--success)',
              color: 'var(--success)',
              padding: '0.6rem 0.8rem',
              borderRadius: 'var(--radius)',
              marginBottom: '1rem',
              fontSize: '0.85rem',
            }}
          >
            {success}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          {parentId && !isEditMode && (
            <div className="form-group">
              <label className="form-label">Parent Node ID</label>
              <input className="form-input" value={parentId} readOnly />
              <div className="form-help">The new node will be added as a child of this node.</div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">
              Title <span className="required">*</span>
            </label>
            <input
              className="form-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter a title..."
              required
              maxLength={2000}
              autoFocus
            />
            <div className="form-help">The node title. Max 2000 chars.</div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input
              className="form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description..."
            />
            <div className="form-help">A short description shown under the title.</div>
          </div>
          <div className="form-group">
            <label className="form-label">Instructions (Markdown)</label>
            <textarea
              className="form-textarea"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Detailed markdown instructions for this task..."
              maxLength={10000}
            />
            <div className="form-help">Full markdown instructions. Max 10000 chars.</div>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn"
              onClick={() => window.history.back()}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !text.trim()}>
              {submitting ? 'Saving…' : isEditMode ? 'Update Node' : 'Add Node'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<FormScreen />);

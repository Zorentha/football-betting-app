import React, { useState } from 'react';

export default function ConfirmSaveModal({ open, onClose, aiAnalysis = {}, fixtureId }) {
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const [error, setError] = useState(null);

  if (!open) return null;

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/betting/fixtures/${fixtureId}/confirm-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prediction: aiAnalysis })
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        throw new Error(j.error || 'Failed to save prediction');
      }
      setSavedId(j.savedId);
      // optionally close after a short delay
      setTimeout(() => {
        setSaving(false);
        onClose && onClose({ savedId: j.savedId });
      }, 800);
    } catch (err) {
      setError(err.message || String(err));
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', left: 0, top: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{ width: '90%', maxWidth: 900, background: '#fff', borderRadius: 8, padding: 16 }}>
        <h3>Confirm & Save AI Analysis</h3>
        <p>Fixture ID: {fixtureId}</p>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h4>Raw / Normalized analysis</h4>
            <pre style={{ maxHeight: 300, overflow: 'auto', background: '#f7f7f7', padding: 8 }}>
              {JSON.stringify(aiAnalysis, null, 2)}
            </pre>
          </div>
        </div>

        {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
        {savedId && <div style={{ color: 'green', marginTop: 8 }}>Saved as id: {savedId}</div>}

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={() => onClose && onClose(null)} disabled={saving}>Cancel</button>
          <button onClick={handleConfirm} disabled={saving} style={{ background: '#007bff', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4 }}>
            {saving ? 'Saving...' : 'Confirm & Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useRef } from 'react';
import { Upload, AlertOctagon, ShieldCheck, RefreshCw, Send, CheckCircle2 } from 'lucide-react';

export default function LiveDashboard({ onNewViolation }) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Per-challan phone + dispatch state: { [challan_id]: { phone, status } }
  const [dispatchMap, setDispatchMap] = useState({});

  const fileInputRef = useRef(null);

  // ── Drag helpers ──────────────────────────────────────────────────────
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  };

  // ── Upload ────────────────────────────────────────────────────────────
  const processFile = async (file) => {
    setUploading(true);
    setResult(null);
    setDispatchMap({});

    const localUrl = URL.createObjectURL(file);
    setPreviewUrl({ url: localUrl, isVideo: file.type.startsWith('video/') });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Server error');

      const data = await response.json();
      setResult(data);

      if (data.status === 'violation' && onNewViolation) {
        onNewViolation();
      }

      // Pre-populate dispatchMap with default phone for each challan
      if (data.challans) {
        const initial = {};
        data.challans.forEach((c) => {
          initial[c.challan_id] = { phone: '9876543210', status: null };
        });
        setDispatchMap(initial);
      }
    } catch (err) {
      console.error(err);
      alert('Error processing file. Please ensure the backend server is running on port 8000.');
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  };

  // ── Per-challan dispatch ──────────────────────────────────────────────
  const handleDispatch = async (challanId) => {
    const entry = dispatchMap[challanId];
    if (!entry) return;

    setDispatchMap((prev) => ({
      ...prev,
      [challanId]: { ...prev[challanId], status: 'sending' },
    }));

    try {
      const response = await fetch('http://localhost:8000/api/challan/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challan_id: challanId, phone_number: entry.phone }),
      });

      setDispatchMap((prev) => ({
        ...prev,
        [challanId]: {
          ...prev[challanId],
          status: response.ok ? 'sent' : null,
        },
      }));
    } catch (err) {
      console.error(err);
      setDispatchMap((prev) => ({
        ...prev,
        [challanId]: { ...prev[challanId], status: null },
      }));
    }
  };

  const updatePhone = (challanId, phone) => {
    setDispatchMap((prev) => ({
      ...prev,
      [challanId]: { ...prev[challanId], phone },
    }));
  };

  const resetScanner = () => {
    setResult(null);
    setPreviewUrl(null);
    setDispatchMap({});
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-grid">

      {/* ── Left: Media Upload & Preview ─────────────────────────────── */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 className="card-title">
          <Upload size={20} /> Traffic Camera Feed
        </h3>

        {!previewUrl ? (
          <div
            className="upload-container"
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="file-input"
              accept="image/*,video/*"
              onChange={handleChange}
            />
            <Upload className="upload-icon" />
            <p className="upload-title">Drag and drop traffic footage here</p>
            <p className="upload-info">Supports JPEG, PNG, MP4, AVI formats</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="media-preview-container">
              {previewUrl.isVideo ? (
                <video src={previewUrl.url} className="preview-media" autoPlay loop muted />
              ) : (
                <img
                  src={result?.challans?.[0]?.image_data || previewUrl.url}
                  className="preview-media"
                  alt="Preview"
                />
              )}

              {/* Scan bar */}
              {uploading && (
                <div style={{
                  position: 'absolute', top: 0, left: 0,
                  width: '100%', height: '4px',
                  backgroundColor: 'var(--primary)',
                  boxShadow: '0 0 10px var(--primary), 0 0 20px var(--primary)',
                  animation: 'scan 2s ease-in-out infinite',
                }} />
              )}
              <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes scan { 0%,100% { top:0% } 50% { top:100% } }
              `}} />

              {uploading && (
                <span className="status-badge scanning">
                  <RefreshCw size={14} style={{ margin: 0, width: 14, height: 14 }} />
                  Analyzing Feed...
                </span>
              )}
              {!uploading && result?.status === 'violation' && (
                <span className="status-badge violation">
                  <AlertOctagon size={14} /> Helmet Violation
                </span>
              )}
              {!uploading && result?.status === 'clear' && (
                <span className="status-badge clear">
                  <ShieldCheck size={14} /> Clear Feed
                </span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={resetScanner}>
                <RefreshCw size={16} /> Scan Another File
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Right: Analysis Result ────────────────────────────────────── */}
      <div className="glass-card">
        <h3 className="card-title">
          <AlertOctagon size={20} /> Analysis Result
        </h3>

        {/* Loading */}
        {uploading && (
          <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div className="spinner" />
            <p style={{ color: 'var(--text-secondary)', marginTop: '1rem', fontSize: '0.95rem' }}>
              Running YOLOv8 Object Detection &amp; Gemini OCR Engine...
            </p>
          </div>
        )}

        {/* Idle */}
        {!uploading && !result && (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
            <ShieldCheck size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <p>Awaiting video or image upload to run safety verification pipeline.</p>
          </div>
        )}

        {/* Clear */}
        {!uploading && result?.status === 'clear' && (
          <div style={{
            backgroundColor: 'var(--success-light)',
            border: '1px solid var(--success)',
            borderRadius: 'var(--border-radius)',
            padding: '2rem',
            textAlign: 'center',
          }}>
            <ShieldCheck size={48} style={{ color: 'var(--success)', marginBottom: '1rem' }} />
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>All Clear!</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              No helmet violations detected in this footage.
            </p>
          </div>
        )}

        {/* Violation — list of challan cards */}
        {!uploading && result?.status === 'violation' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

            {/* Summary banner */}
            <div style={{
              backgroundColor: 'var(--error-light)',
              border: '1px solid var(--error)',
              borderRadius: 'var(--border-radius)',
              padding: '1.25rem',
              display: 'flex',
              gap: '1rem',
              alignItems: 'center',
            }}>
              <AlertOctagon size={24} style={{ color: 'var(--error)', flexShrink: 0 }} />
              <div>
                <h4 style={{ color: 'white', fontWeight: 600 }}>
                  {result.total_challans} Challan{result.total_challans > 1 ? 's' : ''} Generated
                </h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.15rem' }}>
                  Helmet infractions detected. E-Challans have been recorded in the system.
                </p>
              </div>
            </div>

            {/* One card per challan */}
            {result.challans.map((c, idx) => {
              const dispatch = dispatchMap[c.challan_id] || { phone: '9876543210', status: null };
              return (
                <div
                  key={c.challan_id}
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--border-radius)',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                  }}
                >
                  {/* Challan header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Challan #{idx + 1} &nbsp;·&nbsp; CH-{100000 + c.challan_id}
                    </span>
                    <span style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '999px',
                      backgroundColor: 'var(--error-light)',
                      border: '1px solid var(--error)',
                      color: 'var(--error)',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                    }}>
                      {c.violation_type.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Plate + Fine row */}
                  <div style={{ display: 'flex', gap: '1.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Detected Plate
                      </label>
                      <div style={{
                        backgroundColor: '#05080f',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '0.6rem 1rem',
                        fontSize: '1.3rem',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 800,
                        color: 'white',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        marginTop: '0.4rem',
                        textAlign: 'center',
                      }}>
                        {c.vehicle_number}
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Fine
                      </label>
                      <div style={{
                        color: 'var(--primary)',
                        fontSize: '1.3rem',
                        fontWeight: 800,
                        marginTop: '0.4rem',
                        backgroundColor: 'var(--primary-light)',
                        border: '1px solid var(--primary)',
                        borderRadius: '6px',
                        padding: '0.6rem 1rem',
                        textAlign: 'center',
                      }}>
                        ₹{c.fine_amount}
                      </div>
                    </div>
                  </div>

                  {/* Dispatch row */}
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
                      Dispatch SMS notification to vehicle owner.
                    </p>

                    {dispatch.status !== 'sent' ? (
                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <input
                          type="text"
                          value={dispatch.phone}
                          onChange={(e) => updatePhone(c.challan_id, e.target.value)}
                          disabled={dispatch.status === 'sending'}
                          style={{
                            flex: 1,
                            backgroundColor: '#05080f',
                            border: '1px solid var(--border-color)',
                            color: 'white',
                            padding: '0.65rem 1rem',
                            borderRadius: 'var(--border-radius)',
                            outline: 'none',
                            fontSize: '0.9rem',
                          }}
                          placeholder="Owner phone number"
                        />
                        <button
                          className="btn"
                          onClick={() => handleDispatch(c.challan_id)}
                          disabled={dispatch.status === 'sending'}
                        >
                          {dispatch.status === 'sending' ? 'Dispatching...' : <><Send size={15} /> Send SMS</>}
                        </button>
                      </div>
                    ) : (
                      <div style={{
                        backgroundColor: 'var(--success-light)',
                        border: '1px solid var(--success)',
                        padding: '0.85rem 1rem',
                        borderRadius: 'var(--border-radius)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                      }}>
                        <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
                        <span style={{ fontSize: '0.88rem', color: 'white', fontWeight: 500 }}>
                          Dispatched to +91 {dispatch.phone}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

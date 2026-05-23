import React, { useState, useRef } from 'react';
import { Upload, AlertOctagon, ShieldCheck, RefreshCw, Send, CheckCircle2 } from 'lucide-react';

export default function LiveDashboard({ onNewViolation }) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState('9876543210');
  const [dispatchStatus, setDispatchStatus] = useState(null); // 'sending', 'sent'
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (file) => {
    setUploading(true);
    setResult(null);
    setDispatchStatus(null);
    
    // Set a local object URL to show the video/image being uploaded
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl({ url: localUrl, isVideo: file.type.startsWith('video/') });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:8000/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to process file on the server.");
      }

      const data = await response.json();
      setResult(data);
      if (data.status === 'violation' && onNewViolation) {
        onNewViolation(); // Refresh history grid list
      }
    } catch (err) {
      console.error(err);
      alert("Error processing file. Please ensure the backend server is running on port 8000.");
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const handleDispatch = async () => {
    if (!result || !result.challan_id) return;
    setDispatchStatus('sending');
    try {
      const response = await fetch("http://localhost:8000/api/challan/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challan_id: result.challan_id,
          phone_number: phoneNumber
        })
      });
      if (response.ok) {
        setDispatchStatus('sent');
      }
    } catch (err) {
      console.error(err);
      setDispatchStatus(null);
    }
  };

  const resetScanner = () => {
    setResult(null);
    setPreviewUrl(null);
    setDispatchStatus(null);
  };

  return (
    <div className="dashboard-grid">
      {/* Media Upload & Viewer Block */}
      <div className="glass-card" style={{ display: 'flex', flexDirectory: 'column', flexDirection: 'column' }}>
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
            <p className="upload-title">Drag and drop traffic footages here</p>
            <p className="upload-info">Supports JPEG, PNG, MP4, AVI formats</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="media-preview-container">
              {previewUrl.isVideo ? (
                <video src={previewUrl.url} className="preview-media" autoPlay loop muted />
              ) : (
                <img src={result?.image_data || previewUrl.url} className="preview-media" alt="Preview" />
              )}

              {/* Scanning Overlay Animation */}
              {uploading && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '4px',
                  backgroundColor: 'var(--primary)',
                  boxShadow: '0 0 10px var(--primary), 0 0 20px var(--primary)',
                  animation: 'scan 2s ease-in-out infinite'
                }} />
              )}

              {/* Scan styles injected via tag */}
              <style dangerouslySetInnerHTML={{__html: `
                @keyframes scan {
                  0%, 100% { top: 0%; }
                  50% { top: 100%; }
                }
              `}} />

              {/* Status Indicator Badges */}
              {uploading && (
                <span className="status-badge scanning">
                  <RefreshCw size={14} className="spinner" style={{ borderLeftColor: 'transparent', margin: 0, width: '14px', height: '14px' }} />
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

      {/* AI Inference & E-Challan Output Block */}
      <div className="glass-card">
        <h3 className="card-title">
          <AlertOctagon size={20} /> Analysis Result
        </h3>

        {uploading && (
          <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div className="spinner" />
            <p style={{ color: 'var(--text-secondary)', marginTop: '1rem', fontSize: '0.95rem' }}>
              Running YOLOv8 Object Detection & EasyOCR Engine...
            </p>
          </div>
        )}

        {!uploading && !result && (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
            <ShieldCheck size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <p>Awaiting video or image upload to run safety verification pipeline.</p>
          </div>
        )}

        {!uploading && result?.status === 'clear' && (
          <div style={{ 
            backgroundColor: 'var(--success-light)', 
            border: '1px solid var(--success)', 
            borderRadius: 'var(--border-radius)',
            padding: '2rem',
            textAlign: 'center'
          }}>
            <ShieldCheck size={48} style={{ color: 'var(--success)', marginBottom: '1rem' }} />
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>All Clear!</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              The camera feed was verified. The rider was detected wearing a safety helmet, or no active motorcycle was present.
            </p>
          </div>
        )}

        {!uploading && result?.status === 'violation' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Violation Details */}
            <div style={{ 
              backgroundColor: 'var(--error-light)', 
              border: '1px solid var(--error)', 
              borderRadius: 'var(--border-radius)',
              padding: '1.25rem',
              display: 'flex',
              gap: '1rem',
              alignItems: 'center'
            }}>
              <AlertOctagon size={24} style={{ color: 'var(--error)', flexShrink: 0 }} />
              <div>
                <h4 style={{ color: 'white', fontWeight: 600 }}>Helmet Infraction Detected</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.15rem' }}>
                  A rider was detected operating a motorcycle without a protective safety helmet.
                </p>
              </div>
            </div>

            {/* License Plate OCR Box */}
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Detected Plate Number
                </label>
                <div style={{
                  backgroundColor: '#05080f',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '0.75rem 1rem',
                  fontSize: '1.4rem',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  color: 'white',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  marginTop: '0.5rem',
                  textAlign: 'center'
                }}>
                  {result.vehicle_number}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Fine Assessment
                </label>
                <div style={{
                  color: 'var(--primary)',
                  fontSize: '1.4rem',
                  fontWeight: 800,
                  marginTop: '0.5rem',
                  backgroundColor: 'var(--primary-light)',
                  border: '1px solid var(--primary)',
                  borderRadius: '6px',
                  padding: '0.75rem 1rem',
                  textAlign: 'center'
                }}>
                  ₹{result.fine_amount}
                </div>
              </div>
            </div>

            {/* RTO Mock Dispatch Module */}
            <div style={{
              borderTop: '1px solid var(--border-color)',
              paddingTop: '1.5rem'
            }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>E-Challan Dispatch System</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                Dispatch SMS notification with fine receipts link to the vehicle owner register mobile.
              </p>

              {dispatchStatus !== 'sent' ? (
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <input 
                    type="text" 
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    style={{
                      flex: 1,
                      backgroundColor: '#05080f',
                      border: '1px solid var(--border-color)',
                      color: 'white',
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--border-radius)',
                      outline: 'none',
                      fontSize: '0.95rem'
                    }}
                    placeholder="Enter owner phone number"
                    disabled={dispatchStatus === 'sending'}
                  />
                  <button className="btn" onClick={handleDispatch} disabled={dispatchStatus === 'sending'}>
                    {dispatchStatus === 'sending' ? (
                      'Dispatching...'
                    ) : (
                      <>
                        <Send size={16} /> Send SMS
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div style={{
                  backgroundColor: 'var(--success-light)',
                  border: '1px solid var(--success)',
                  padding: '1rem',
                  borderRadius: 'var(--border-radius)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}>
                  <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
                  <span style={{ fontSize: '0.9rem', color: 'white', fontWeight: 500 }}>
                    E-Challan successfully dispatched to +91 {phoneNumber}!
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

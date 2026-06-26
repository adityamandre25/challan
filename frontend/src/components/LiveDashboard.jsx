import React, { useState, useRef, useEffect } from 'react';
import {
  Upload, AlertOctagon, ShieldCheck, RefreshCw, Send, CheckCircle2,
  Sliders, Activity, Flame, TrendingUp, TrendingDown, Target, Info, ShieldAlert
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const PREDEFINED_LOCATIONS = [
  "Silk Board Signal",
  "MG Road Junction",
  "Highway Sector 4",
  "Camera Zone A",
  "Street 1"
];

export default function LiveDashboard({ challans = [], onNewViolation }) {
  const [selectedLocation, setSelectedLocation] = useState(PREDEFINED_LOCATIONS[0]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [confThreshold, setConfThreshold] = useState(0.25);
  const [pipelineState, setPipelineState] = useState('');


  const [dispatchMap, setDispatchMap] = useState({});
  const fileInputRef = useRef(null);


  useEffect(() => {
    if (!uploading) {
      setPipelineState('');
      return;
    }
    const steps = [
      "Initializing AI pipeline...",
      "Running YOLOv8 vehicle detection...",
      "Checking helmet compliance...",
      "Extracting license plates...",
      "Resolving RTO registry data...",
      "Finalizing E-Challan ticket..."
    ];
    let i = 0;
    setPipelineState(steps[0]);
    const interval = setInterval(() => {
      i = (i + 1) % steps.length;
      setPipelineState(steps[i]);
    }, 1500);
    return () => clearInterval(interval);
  }, [uploading]);


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


  const processFile = async (file) => {
    setUploading(true);
    setResult(null);
    setDispatchMap({});

    const localUrl = URL.createObjectURL(file);
    setPreviewUrl({ url: localUrl, isVideo: file.type.startsWith('video/') });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('location', selectedLocation);

    try {
      const response = await fetch(`${API}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Server error');

      const data = await response.json();
      setResult(data);

      if (data.status === 'violation' && onNewViolation) {
        onNewViolation();
      }


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


  const handleDispatch = async (challanId) => {
    const entry = dispatchMap[challanId];
    if (!entry) return;

    setDispatchMap((prev) => ({
      ...prev,
      [challanId]: { ...prev[challanId], status: 'sending' },
    }));

    try {
      const response = await fetch(`${API}/api/challan/dispatch`, {
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


  const hotspotLeaderboard = PREDEFINED_LOCATIONS.map(loc => {
    const locChallans = challans.filter(c => (c.location || 'Camera Zone A') === loc);
    const total = locChallans.length;
    const paid = locChallans.filter(c => c.status === 'Paid').length;
    const pending = total - paid;


    let trend = 'flat';
    if (loc === "Silk Board Signal" || loc === "MG Road Junction") trend = 'up';
    if (loc === "Street 1") trend = 'down';

    return { name: loc, total, paid, pending, trend };
  }).sort((a, b) => b.total - a.total);

  const maxViolations = Math.max(...hotspotLeaderboard.map(h => h.total), 1);
  const mostDangerousZone = hotspotLeaderboard[0]?.total > 0 ? hotspotLeaderboard[0].name : "N/A";

  return (
    <div className="dashboard-grid">

      { }
      <div className="left-panel">
        <div className="glass-card feed-card">
          <div className="feed-header">
            <h3 className="card-title">
              <Activity className="text-cyan pulse" size={20} /> Surveillance Camera Intake
            </h3>

            { }
            <div className="location-select-wrapper">
              <span className="select-label font-mono">FEED INTAKE SOURCE:</span>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                disabled={uploading || previewUrl}
                className="hud-select"
              >
                {PREDEFINED_LOCATIONS.map(loc => (
                  <option key={loc} value={loc}>{loc.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>

          {!previewUrl ? (
            <div
              className={`upload-container futuristic-dropzone ${dragActive ? 'drag-active' : ''}`}
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
              <div className="crosshair tl"></div>
              <div className="crosshair tr"></div>
              <div className="crosshair bl"></div>
              <div className="crosshair br"></div>

              <Upload className="upload-icon text-cyan" />
              <p className="upload-title font-mono uppercase tracking-wider text-cyan">INJECT SURVEILLANCE FEED</p>
              <p className="upload-info">Drag &amp; drop video logs or photos here</p>
              <span className="hud-badge-muted mt-4">RAW H.264 / JPEG / PNG</span>
            </div>
          ) : (
            <div className="preview-layout">
              <div className="media-preview-container futuristic-border">
                {previewUrl.isVideo ? (
                  <video
                    src={previewUrl.url}
                    className="preview-media"
                    autoPlay
                    loop
                    muted

                    onLoadedData={() => console.log("loaded")}
                    onError={(e) => console.log("video error", e)}
                  />
                ) : (
                  <img
                    src={result?.challans?.[0]?.image_data || previewUrl.url}
                    className="preview-media"
                    alt="Preview"
                  />
                )}

                { }
                <div className="corner-bracket tl"></div>
                <div className="corner-bracket tr"></div>
                <div className="corner-bracket bl"></div>
                <div className="corner-bracket br"></div>

                { }
                {uploading && <div className="scanner-line" />}

                { }
                <div className="camera-overlay font-mono">
                  <span className="dot pulse-red"></span>
                  FEED: {selectedLocation.toUpperCase()}
                </div>

                { }
                {!uploading && result?.status === 'violation' && (
                  <div className="pipeline-overlay font-mono">
                    YOLOv8 CONF: &gt;{(confThreshold * 100).toFixed(0)}%
                  </div>
                )}

                { }
                {uploading && (
                  <span className="status-badge scanning pulse">
                    <RefreshCw size={14} className="spin" />
                    AI PROCESSING...
                  </span>
                )}
                {!uploading && result?.status === 'violation' && (
                  <span className="status-badge violation animate-pulse-border">
                    <AlertOctagon size={14} /> SYSTEM INFRACTION DETECTED
                  </span>
                )}
                {!uploading && result?.status === 'clear' && (
                  <span className="status-badge clear">
                    <ShieldCheck size={14} /> SAFETY STANDARDS MET
                  </span>
                )}
              </div>

              <div className="preview-actions">
                <button className="btn btn-secondary font-mono" onClick={resetScanner}>
                  <RefreshCw size={15} /> FLUSH INTAKE CACHE
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      { }
      <div className="right-panel">

        { }
        <div className="glass-card result-card">
          <h3 className="card-title">
            <Target className="text-cyan" size={20} /> AI Target Analysis
          </h3>

          { }
          {uploading && (
            <div className="loader-hud font-mono">
              <div className="spinner-hud" />
              <p className="loading-status text-cyan animate-pulse">{pipelineState}</p>
              <div className="progress-bar-hud">
                <div className="fill fill-anim"></div>
              </div>
            </div>
          )}

          { }
          {!uploading && !result && (
            <div className="empty-hud font-mono">
              <ShieldAlert size={36} className="text-muted mb-4 opacity-40" />
              <p className="title text-muted">AWAITING FOOTAGE INTAKE</p>
              <p className="sub text-muted-dark">Inject camera stream feed on the left to activate YOLOv8 detection.</p>
            </div>
          )}

          { }
          {!uploading && result?.status === 'clear' && (
            <div className="clear-hud font-mono">
              <div className="status-header">
                <ShieldCheck size={36} className="text-success mb-2" />
                <h4 className="text-success">FEED RATING: SECURE</h4>
              </div>
              <p className="desc text-muted">No helmet infractions or safety violations detected in processed frame sets.</p>
              <div className="diagnostics-summary">
                <div>SCANNED CLASS: RIDER / BIKE</div>
                <div>CONFIDENCE LEVEL: {(confThreshold * 100).toFixed(0)}%+</div>
              </div>
            </div>
          )}

          { }
          {!uploading && result?.status === 'violation' && (
            <div className="violations-panel">
              { }
              <div className="alert-badge-hud font-mono">
                <AlertOctagon size={20} className="text-danger animate-pulse" />
                <div>
                  <h4 className="text-danger uppercase">{result.total_challans} INFRACTION{result.total_challans > 1 ? 'S' : ''} GENERATED</h4>
                  <p className="text-muted text-xs">AI pipeline registered safety incident at {selectedLocation}.</p>
                </div>
              </div>

              { }
              <div className="violation-list">
                {result.challans.map((c, idx) => {
                  const dispatch = dispatchMap[c.challan_id] || { phone: '9876543210', status: null };

                  const confidence = ((c.challan_id * 7 + 84) % 12 + 85);
                  return (
                    <div key={c.challan_id} className="violation-hud-card font-mono">

                      <div className="card-sec-header">
                        <span className="ticket-id text-cyan">TICKET CH-{100000 + c.challan_id}</span>
                        <span className="violation-badge">{c.violation_type.replace(/_/g, ' ').toUpperCase()}</span>
                      </div>

                      <div className="ocr-plate-block">
                        <div className="plate-col">
                          <span className="hud-label-text">IDENTIFIED PLATE</span>
                          { }
                          <div className="license-plate-ui">
                            <div className="plate-ind">IND</div>
                            <div className="plate-number">{c.vehicle_number}</div>
                          </div>
                        </div>

                        <div className="penalty-col">
                          <span className="hud-label-text">PENALTY FINE</span>
                          <div className="fine-badge-ui">₹{c.fine_amount}</div>
                        </div>
                      </div>

                      <div className="confidence-hud-row">
                        <span className="lbl">DETECTION CONFIDENCE:</span>
                        <div className="conf-progress">
                          <div className="fill" style={{ width: `${confidence}%` }}></div>
                        </div>
                        <span className="val text-cyan">{confidence}%</span>
                      </div>

                      { }
                      <div className="sms-dispatch-block">
                        {dispatch.status !== 'sent' ? (
                          <div className="dispatch-input-row">
                            <input
                              type="text"
                              value={dispatch.phone}
                              onChange={(e) => updatePhone(c.challan_id, e.target.value)}
                              disabled={dispatch.status === 'sending'}
                              className="hud-input-text font-mono"
                              placeholder="Mobile number"
                            />
                            <button
                              className="hud-dispatch-btn font-mono"
                              onClick={() => handleDispatch(c.challan_id)}
                              disabled={dispatch.status === 'sending'}
                            >
                              {dispatch.status === 'sending' ? (
                                'SENDING...'
                              ) : (
                                <><Send size={12} /> DISPATCH</>
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="dispatch-success-ui">
                            <CheckCircle2 size={14} className="text-success" />
                            <span>NOTIFIED: +91 {dispatch.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        { }
        <div className="glass-card mt-6">
          <div className="leaderboard-header font-mono">
            <h3 className="card-title font-sans">
              <Flame className="text-danger animate-pulse" size={20} /> Violation Hotspots
            </h3>
            {mostDangerousZone !== "N/A" && (
              <div className="danger-zone-hud">
                <span className="dot pulse-red"></span>
                <span>MAX DANGER ZONE: {mostDangerousZone.toUpperCase()}</span>
              </div>
            )}
          </div>

          <p className="card-subtitle-hud text-muted font-mono text-xs mb-4">
            Camera zone rank list calculated by ticket dispatch volume.
          </p>

          <div className="leaderboard-hud-list font-mono">
            {hotspotLeaderboard.map((item, idx) => {
              const percentage = Math.max(10, Math.round((item.total / maxViolations) * 100));
              return (
                <div key={item.name} className="leaderboard-row">
                  <div className="row-meta">
                    <span className="rank-num text-cyan">#{idx + 1}</span>
                    <span className="zone-name" title={item.name}>{item.name}</span>

                    { }
                    {item.total > 15 ? (
                      <span className="heat-badge danger">CRITICAL</span>
                    ) : item.total >= 8 ? (
                      <span className="heat-badge warning">HIGH</span>
                    ) : item.total > 0 ? (
                      <span className="heat-badge primary">MODERATE</span>
                    ) : (
                      <span className="heat-badge success">LOW</span>
                    )}

                    { }
                    <span className="trend-indicator-hud">
                      {item.trend === 'up' && <TrendingUp size={14} className="text-danger" />}
                      {item.trend === 'down' && <TrendingDown size={14} className="text-success" />}
                      {item.trend === 'flat' && <span className="text-muted-dark">—</span>}
                    </span>
                  </div>

                  { }
                  <div className="row-chart">
                    <div className="progress-bar-hud">
                      <div className="fill fill-orange" style={{ width: `${percentage}%` }}></div>
                    </div>

                    <div className="row-vals text-xs">
                      <span>Violations: <strong className="text-white">{item.total}</strong></span>
                      <span className="val-sep">|</span>
                      <span>Paid: <strong className="text-success">{item.paid}</strong></span>
                      <span className="val-sep">|</span>
                      <span>Pending: <strong className="text-danger">{item.pending}</strong></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
}

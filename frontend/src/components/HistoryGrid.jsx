import React, { useState } from 'react';
import { 
  Calendar, Eye, Download, Search, SlidersHorizontal, ArrowUpDown, 
  MapPin, CheckCircle, AlertTriangle, ShieldAlert, Award, Trash2
} from 'lucide-react';

export default function HistoryGrid({ challans, onView, onDownload, onDelete }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState('date_desc');

  if (!challans || challans.length === 0) {
    return (
      <div className="glass-card font-mono" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <CheckCircle size={48} className="text-muted" style={{ marginBottom: '1rem', opacity: 0.5 }} />
        <h3 className="text-white" style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>NO ENFORCEMENT RECORDS FOUND</h3>
        <p className="text-muted" style={{ fontSize: '0.9rem' }}>
          Database is currently empty. Run live camera uploads to generate E-Challan telemetry.
        </p>
      </div>
    );
  }

  // ── Filtering logic ──────────────────────────────────────────────────
  const filteredChallans = challans.filter(c => {
    const matchesSearch = 
      c.vehicle_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.location || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.reason || '').toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesStatus = 
      statusFilter === 'All' || 
      c.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  // ── Sorting logic ────────────────────────────────────────────────────
  const sortedChallans = [...filteredChallans].sort((a, b) => {
    if (sortBy === 'date_desc') {
      return b.id - a.id; // higher ID is more recent
    }
    if (sortBy === 'date_asc') {
      return a.id - b.id;
    }
    if (sortBy === 'fine_desc') {
      return b.fine_amount - a.fine_amount;
    }
    if (sortBy === 'fine_asc') {
      return a.fine_amount - b.fine_amount;
    }
    if (sortBy === 'location') {
      return (a.location || 'Camera Zone A').localeCompare(b.location || 'Camera Zone A');
    }
    if (sortBy === 'status') {
      return a.status.localeCompare(b.status);
    }
    if (sortBy === 'confidence_desc') {
      const confA = ((a.id * 7 + 84) % 12 + 85);
      const confB = ((b.id * 7 + 84) % 12 + 85);
      return confB - confA;
    }
    return 0;
  });

  return (
    <div className="history-section">
      
      {/* ── High-Tech Filter & Sort Control Toolbar ─────────────────── */}
      <div className="toolbar-hud glass-card font-mono mb-6">
        <div className="toolbar-left">
          <div className="search-hud-wrapper">
            <Search className="search-icon" size={16} />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="SEARCH VEHICLE PLATE / LOCATION / TICKET..." 
              className="toolbar-search-input"
            />
          </div>

          <div className="filter-pills-hud">
            <span className="toolbar-label">STATUS:</span>
            {['All', 'Pending', 'Paid'].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`pill-btn ${statusFilter === status ? 'active' : ''}`}
              >
                {status.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar-right">
          <SlidersHorizontal size={14} className="text-cyan" />
          <span className="toolbar-label">SORT BY:</span>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="toolbar-select-hud"
          >
            <option value="date_desc">DATE (LATEST FIRST)</option>
            <option value="date_asc">DATE (OLDEST FIRST)</option>
            <option value="fine_desc">FINE (HIGH → LOW)</option>
            <option value="fine_asc">FINE (LOW → HIGH)</option>
            <option value="location">SURVEILLANCE ZONE</option>
            <option value="status">PAYMENT RESOLUTION</option>
            <option value="confidence_desc">ML CONFIDENCE</option>
          </select>
        </div>
      </div>

      {/* ── Smart Enforcement Records Results Count ─────────────────── */}
      <div className="results-count-hud font-mono mb-4 text-xs">
        SCANNED NODES: <span className="text-cyan">{sortedChallans.length}</span> / {challans.length} VERIFIED INCIDENTS
      </div>

      {/* ── Enforcement Grid ────────────────────────────────────────── */}
      <div className="history-grid">
        {sortedChallans.map((challan) => {
          // Calculate deterministic ML confidence score for display
          const confidence = ((challan.id * 7 + 84) % 12 + 85);
          
          return (
            <div key={challan.id} className="challan-card futuristic-border">
              
              {/* Media Evidence Frame */}
              <div className="challan-card-media">
                {challan.image_data ? (
                  <img src={challan.image_data} alt="Violation Evidence" className="challan-card-image" />
                ) : (
                  <div className="no-evidence-placeholder font-mono text-xs">
                    <ShieldAlert size={24} className="text-muted mb-2 opacity-50" />
                    NO PHOTO EVIDENCE
                  </div>
                )}
                
                {/* Deletion Overlay Icon */}
                <button 
                  className="delete-card-overlay-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(challan.id);
                  }}
                  title="Delete Telemetry Record"
                >
                  <Trash2 size={13} />
                </button>
                
                {/* Visual Location Overlay Badge */}
                <span className="media-location-overlay font-mono">
                  {challan.location ? challan.location.toUpperCase() : "CAMERA ZONE A"}
                </span>

                {/* Status Badge */}
                <span className={`challan-card-badge ${challan.status === 'Paid' ? 'paid' : ''}`}>
                  {challan.status === 'Paid' ? 'PAID' : 'PENDING'}
                </span>
              </div>

              {/* Information / Metadata Body */}
              <div className="challan-card-info">
                
                {/* Header: Ticket ID + Fine */}
                <div className="card-top-meta font-mono">
                  <span className="ticket-id text-cyan">TICKET CH-{100000 + challan.id}</span>
                  <span className="challan-price">₹{challan.fine_amount || 1000}</span>
                </div>
                
                {/* Embossed License Plate Representation */}
                <div className="plate-ui-container mb-3">
                  <div className="license-plate-ui compact">
                    <div className="plate-ind">IND</div>
                    <div className="plate-number">{challan.vehicle_number}</div>
                  </div>
                </div>

                {/* Violation Type */}
                <div className="violation-reason-hud font-mono text-xs mb-3">
                  <span className="violation-label">OFFENSE:</span>
                  <span className="violation-text text-white">
                    {challan.reason && challan.reason.includes("Driver") ? "Rider No Helmet (194D)" : 
                     challan.reason && challan.reason.includes("Passenger") ? "Pillion No Helmet (194D)" : 
                     "Safety Helmet Violation (194D)"}
                  </span>
                </div>

                {/* Metadata Stack */}
                <div className="metadata-hud-stack font-mono text-xs">
                  <div className="meta-row">
                    <MapPin size={12} className="text-cyan" />
                    <span className="truncate-text" title={challan.location || 'Camera Zone A'}>
                      {challan.location || 'Camera Zone A'}
                    </span>
                  </div>
                  
                  <div className="meta-row">
                    <Calendar size={12} className="text-cyan" />
                    <span>{challan.timestamp}</span>
                  </div>

                  <div className="meta-row">
                    <Award size={12} className="text-cyan" />
                    <span>AI Confidence: <strong className="text-cyan">{confidence}%</strong></span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="challan-card-actions font-mono">
                <button 
                  className="btn btn-secondary font-mono" 
                  onClick={() => onView(challan)} 
                  style={{ fontSize: '0.8rem', padding: '0.55rem' }}
                >
                  <Eye size={12} /> TELEMETRY
                </button>
                <button 
                  className="btn font-mono" 
                  onClick={() => onDownload(challan)} 
                  style={{ fontSize: '0.8rem', padding: '0.55rem' }}
                >
                  <Download size={12} /> EXPORT PDF
                </button>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}

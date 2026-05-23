import React from 'react';
import { Calendar, Eye, Download, CheckCircle, AlertTriangle } from 'lucide-react';

export default function HistoryGrid({ challans, onView, onDownload }) {
  if (!challans || challans.length === 0) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <CheckCircle size={48} style={{ color: 'var(--text-secondary)', marginBottom: '1rem', opacity: 0.5 }} />
        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>No Challans Generated Yet</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Upload traffic images or videos in the "Live Detection" tab to identify violations and generate tickets.
        </p>
      </div>
    );
  }

  return (
    <div className="history-grid">
      {challans.map((challan) => (
        <div key={challan.id} className="challan-card">
          <div className="challan-card-media">
            {challan.image_data ? (
              <img src={challan.image_data} alt="Violation" className="challan-card-image" />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                No Photo Evidence
              </div>
            )}
            
            {/* Status Badge */}
            <span className={`challan-card-badge ${challan.status === 'Paid' ? 'paid' : ''}`}>
              {challan.status === 'Paid' ? 'PAID' : 'PENDING'}
            </span>
          </div>

          <div className="challan-card-info">
            <div className="challan-card-header">
              <span className="challan-plate" style={{ textTransform: 'uppercase' }}>
                {challan.vehicle_number}
              </span>
              <span className="challan-price">₹{challan.fine_amount}</span>
            </div>
            
            <p className="challan-reason">{challan.reason}</p>
            
            <div className="challan-time">
              <Calendar size={14} />
              <span>{challan.timestamp}</span>
            </div>
          </div>

          <div className="challan-card-actions">
            <button className="btn btn-secondary" onClick={() => onView(challan)} style={{ fontSize: '0.85rem', padding: '0.5rem' }}>
              <Eye size={14} /> View
            </button>
            <button className="btn" onClick={() => onDownload(challan)} style={{ fontSize: '0.85rem', padding: '0.5rem' }}>
              <Download size={14} /> Download
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

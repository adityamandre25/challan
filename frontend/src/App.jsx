import React, { useState, useEffect, useRef } from 'react';
import { Camera, List, Shield, Download } from 'lucide-react';
import LiveDashboard from './components/LiveDashboard';
import HistoryGrid from './components/HistoryGrid';
import ChallanTemplate from './components/ChallanTemplate';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export default function App() {
  const [activeTab, setActiveTab] = useState('live'); // 'live' or 'history'
  const [challans, setChallans] = useState([]);
  const [selectedChallan, setSelectedChallan] = useState(null);
  const [downloadChallan, setDownloadChallan] = useState(null);
  const downloadRef = useRef(null);

  // Fetch challans from SQLite backend
  const fetchChallans = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/history");
      if (response.ok) {
        const data = await response.json();
        setChallans(data);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  };

  useEffect(() => {
    fetchChallans();
  }, []);

  // Mark challan as Paid
  const handlePayChallan = async (id) => {
    try {
      const response = await fetch("http://localhost:8000/api/challan/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challan_id: id })
      });
      if (response.ok) {
        fetchChallans();
        // Update selected challan if open
        if (selectedChallan && selectedChallan.id === id) {
          setSelectedChallan(prev => ({ ...prev, status: 'Paid' }));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Immediate PDF Download from Card Trigger
  const triggerCardDownload = (challan) => {
    setDownloadChallan(challan);
  };

  useEffect(() => {
    if (!downloadChallan) return;
    
    // Tiny delay to let the off-screen element render in DOM
    const generatePdfOffscreen = async () => {
      const element = downloadRef.current;
      if (!element) return;
      
      try {
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#FFFFFF',
        });
        
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        });
        
        const imgWidth = 210;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
        pdf.save(`E-Challan_${downloadChallan.id || 'N/A'}_${downloadChallan.vehicle_number.replace(/\s+/g, '')}.pdf`);
      } catch (err) {
        console.error('Error generating PDF:', err);
      } finally {
        setDownloadChallan(null);
      }
    };

    generatePdfOffscreen();
  }, [downloadChallan]);

  return (
    <div className="app-container">
      {/* Top Header Navigation */}
      <header className="header">
        <div className="brand">
          <Shield className="brand-icon" />
          <span className="brand-title">E-Challan System</span>
        </div>
        
        <nav className="nav-links">
          <button 
            className={`nav-btn ${activeTab === 'live' ? 'active' : ''}`}
            onClick={() => setActiveTab('live')}
          >
            <Camera size={16} /> Live Detection
          </button>
          
          <button 
            className={`nav-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('history');
              fetchChallans(); // Refresh list on open
            }}
          >
            <List size={16} /> Challan History
          </button>
        </nav>
      </header>

      {/* Main Pages */}
      <main className="main-content">
        {activeTab === 'live' ? (
          <div>
            <div className="page-title-section">
              <h2 className="page-title">Live Safety Enforcement</h2>
              <p className="page-subtitle">Upload footage to automatically detect unhelmeted riders and extract vehicle registration details.</p>
            </div>
            
            <LiveDashboard onNewViolation={fetchChallans} />
          </div>
        ) : (
          <div>
            <div className="page-title-section">
              <h2 className="page-title">Generated E-Challans</h2>
              <p className="page-subtitle">Historical records of safety infractions, captured evidence, and payment receipts.</p>
            </div>
            
            <HistoryGrid 
              challans={challans} 
              onView={(c) => setSelectedChallan(c)} 
              onDownload={triggerCardDownload} 
            />
          </div>
        )}
      </main>

      {/* Detail/Action Modal */}
      {selectedChallan && (
        <div className="modal-overlay" onClick={() => setSelectedChallan(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '820px' }}>
            <ChallanTemplate 
              challan={selectedChallan} 
              onPay={handlePayChallan} 
              onClose={() => setSelectedChallan(null)} 
            />
          </div>
        </div>
      )}

      {/* Hidden Offscreen PDF Rendering Container */}
      {downloadChallan && (
        <div style={{
          position: 'absolute',
          left: '-9999px',
          top: '-9999px',
          width: '794px', // Standard pixels corresponding to A4 width
          backgroundColor: '#FFFFFF',
          zIndex: -1000
        }}>
          <div ref={downloadRef} className="official-challan" style={{ border: 'none', margin: 0, padding: '2.5rem' }}>
            <div className="challan-watermark">E-CHALLAN</div>
            
            <div className="official-challan-header">
              <div className="official-challan-title-block">
                <h1>E-CHALLAN</h1>
                <p>Department of Traffic & Transport Regulations</p>
              </div>
              <div className="official-challan-meta-block">
                <div>Challan No: <strong>CH-{100000 + downloadChallan.id}</strong></div>
                <div>Date: <strong>{downloadChallan.timestamp}</strong></div>
              </div>
            </div>

            <div className="official-challan-body" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1E3A8A', marginBottom: '1rem' }}>
                  VIOLATION RECORD
                </h3>
                <table className="challan-details-table">
                  <tbody>
                    <tr>
                      <td className="label">Vehicle Number</td>
                      <td className="value" style={{ textTransform: 'uppercase' }}>{downloadChallan.vehicle_number}</td>
                    </tr>
                    <tr>
                      <td className="label">Offense Category</td>
                      <td className="value" style={{ color: '#DC2626' }}>Safety Helmet Violation</td>
                    </tr>
                    <tr>
                      <td className="label">Reason for Fine</td>
                      <td className="value">{downloadChallan.reason}</td>
                    </tr>
                    <tr>
                      <td className="label">Fine Penalty</td>
                      <td className="value" style={{ color: '#2563EB', fontSize: '1.1rem' }}>₹ {downloadChallan.fine_amount}</td>
                    </tr>
                    <tr>
                      <td className="label">Offense Location</td>
                      <td className="value">Camera Feed #04 - Junction Point 1B</td>
                    </tr>
                    <tr>
                      <td className="label">Payment Status</td>
                      <td className="value" style={{ fontWeight: '700', color: downloadChallan.status === 'Paid' ? '#10B981' : '#EF4444' }}>
                        {downloadChallan.status === 'Paid' ? 'PAID' : 'PENDING'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="challan-evidence-block">
                <div className="evidence-wrapper">
                  <div className="evidence-header">Evidence Camera snapshot</div>
                  {downloadChallan.image_data && (
                    <img src={downloadChallan.image_data} alt="Violation" className="evidence-img" />
                  )}
                </div>
              </div>
            </div>

            <div className="official-challan-footer">
              <div className="footer-disclaimer">
                This is a computer-generated official document. Please pay the penalty within 15 days of issuance to avoid legal action under Section 194D of the Motor Vehicles Act.
              </div>
              <div className="footer-seal">
                Authorized Seal
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

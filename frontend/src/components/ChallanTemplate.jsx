import React, { useRef } from 'react';
import { Download, CheckCircle, AlertTriangle } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export default function ChallanTemplate({ challan, onPay, onClose, showActions = true }) {
  const challanRef = useRef(null);

  const downloadPDF = async () => {
    const element = challanRef.current;
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
      const pageHeight = 295; 
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
      pdf.save(`E-Challan_${challan.id || 'N/A'}_${challan.vehicle_number.replace(/\s+/g, '')}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
    }
  };

  const ticketNumber = `CH-${100000 + (challan.id || 1)}`;

  return (
    <div className="modal-content-container">
      {}
      {showActions && (
        <div style={{
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '1.25rem 2rem', 
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'rgba(11, 15, 25, 0.4)'
        }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Challan Details</h3>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '0.4rem 0.8rem' }}>Close</button>
        </div>
      )}

      {}
      <div style={{ padding: '2rem', backgroundColor: '#F8FAFC' }}>
        <div ref={challanRef} className="official-challan">
          <div className="challan-watermark">E-CHALLAN</div>
          
          <div className="official-challan-header">
            <div className="official-challan-title-block">
              <h1>E-CHALLAN</h1>
              <p>Department of Traffic & Transport Regulations</p>
            </div>
            <div className="official-challan-meta-block">
              <div>Challan No: <strong>{ticketNumber}</strong></div>
              <div>Date: <strong>{challan.timestamp}</strong></div>
            </div>
          </div>

          <div className="official-challan-body">
            {}
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1E3A8A', marginBottom: '1rem', fontFamily: 'var(--font-display)' }}>
                VIOLATION RECORD
              </h3>
              <table className="challan-details-table">
                <tbody>
                  <tr>
                    <td className="label">Vehicle Number</td>
                    <td className="value" style={{ textTransform: 'uppercase', fontSize: '1.05rem', letterSpacing: '0.5px' }}>
                      {challan.vehicle_number}
                    </td>
                  </tr>
                  <tr>
                    <td className="label">Offense Category</td>
                    <td className="value" style={{ color: '#DC2626' }}>Safety Helmet Violation</td>
                  </tr>
                  <tr>
                    <td className="label">Reason for Fine</td>
                    <td className="value">{challan.reason}</td>
                  </tr>
                  <tr>
                    <td className="label">Fine Penalty</td>
                    <td className="value" style={{ color: '#2563EB', fontSize: '1.1rem' }}>₹ {challan.fine_amount}</td>
                  </tr>
                  <tr>
                    <td className="label">Offense Location</td>
                    <td className="value">{challan.location || "Camera Zone A"}</td>
                  </tr>
                  <tr>
                    <td className="label">Payment Status</td>
                    <td className="value">
                      <span style={{
                        color: challan.status === 'Paid' ? '#10B981' : '#EF4444',
                        fontWeight: '700'
                      }}>
                        {challan.status === 'Paid' ? 'PAID' : 'PENDING'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div style={{ marginTop: '2rem' }}>
                <span className={`challan-payment-indicator ${challan.status === 'Paid' ? 'paid' : ''}`}>
                  {challan.status === 'Paid' ? 'Receipt Issued' : 'Fine Payment Required'}
                </span>
              </div>
            </div>

            {}
            <div className="challan-evidence-block">
              <div className="evidence-wrapper">
                <div className="evidence-header">Evidence Camera snapshot</div>
                {challan.image_data ? (
                  <img src={challan.image_data} alt="Violation" className="evidence-img" />
                ) : (
                  <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
                    No Photo Evidence
                  </div>
                )}
              </div>

              {challan.plate_crop && (
                <div className="evidence-wrapper">
                  <div className="evidence-header">Number Plate Crop</div>
                  <img src={challan.plate_crop} alt="Plate Crop" className="evidence-img plate-crop-img" />
                </div>
              )}
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

      {}
      {showActions && (
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={downloadPDF}>
            <Download size={18} /> Download PDF
          </button>
          {challan.status !== 'Paid' && (
            <button className="btn" onClick={() => onPay(challan.id)}>
              <CheckCircle size={18} /> Mark as Paid
            </button>
          )}
        </div>
      )}
    </div>
  );
}

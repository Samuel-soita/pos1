import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Check, Smartphone } from 'lucide-react';
import { db, type Product } from '../db/db';

interface BarcodeScannerProps {
  onScan: (product: Product, price?: number) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [manualPrice, setManualPrice] = useState<string>('');
  const [isScanning, setIsScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleScanSuccess = useCallback(async (decodedText: string) => {
    // Look up product in DB
    const product = await db.products.where('barcode').equals(decodedText).first();
    
    if (product) {
      setScannedProduct(product);
      setManualPrice(product.price.toString());
      setIsScanning(false); // Pause scanning to confirm price
    } else {
      // Product not found - could offer to add new, but for now just ignore or toast
      console.warn("Product with barcode not found:", decodedText);
    }
  }, []);

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    const scannerId = "reader";

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        html5QrCode = new Html5Qrcode(scannerId);
        scannerRef.current = html5QrCode;

        const config = { fps: 10, qrbox: { width: 250, height: 150 } };
        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          handleScanSuccess,
          undefined
        );
      } catch (err) {
        console.error("Camera access failed:", err);
        setError("Camera access denied. Please check permissions.");
      }
    };

    startScanner();

    return () => {
      if (html5QrCode?.isScanning) {
        html5QrCode.stop().catch(console.error);
      }
    };
  }, [handleScanSuccess]);

  const handleConfirmPrice = () => {
    if (scannedProduct) {
      onScan(scannedProduct, parseFloat(manualPrice) || scannedProduct.price);
      setScannedProduct(null);
      setManualPrice('');
      setIsScanning(true); // Resume scanning workflow
    }
  };

  return (
    <div style={{ 
      position: 'fixed', 
      inset: 0, 
      background: 'rgba(15, 23, 42, 0.95)', 
      zIndex: 10000, 
      display: 'flex', 
      flexDirection: 'column',
      padding: '20px'
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
          <Smartphone /> Smart Barcode Scanner
        </h2>
        <button className="btn-secondary" onClick={onClose} style={{ padding: '12px', background: 'rgba(255,255,255,0.1)', color: 'white' }}>
          <X size={24} />
        </button>
      </header>

      <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div id="reader" style={{ width: '100%', maxWidth: '500px', borderRadius: '16px', overflow: 'hidden' }}></div>
        
        {/* Viewfinder Guide */}
        {isScanning && (
          <div style={{ 
            position: 'absolute', 
            width: '250px', 
            height: '150px', 
            border: '2px solid var(--primary)', 
            borderRadius: '12px',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
            zIndex: 1
          }}>
            <div style={{ position: 'absolute', top: -30, width: '100%', textAlign: 'center', color: 'white', fontSize: '0.8rem', fontWeight: 600 }}>
              Align Barcode in the Center
            </div>
            {/* Animated Scanning Line */}
            <div className="scanner-line"></div>
          </div>
        )}

        {/* Price Confirmation Overlay */}
        {scannedProduct && (
          <div className="card fade-in" style={{ 
            position: 'absolute', 
            zIndex: 10, 
            width: '90%', 
            maxWidth: '400px',
            padding: '32px',
            textAlign: 'center'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px' }}>{scannedProduct.name} Found!</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Confirm or edit the price for this sale:</p>
            
            <div className="input-group">
              <label>Price (KES)</label>
              <input 
                type="number" 
                step="0.01"
                autoFocus
                value={manualPrice}
                onChange={e => setManualPrice(e.target.value)}
                style={{ fontSize: '1.5rem', fontWeight: 700, textAlign: 'center' }}
                onKeyDown={e => e.key === 'Enter' && handleConfirmPrice()}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button 
                className="btn-primary" 
                style={{ flex: 1, padding: '14px' }}
                onClick={handleConfirmPrice}
              >
                <Check size={20} /> Add to Cart
              </button>
              <button 
                className="btn-secondary" 
                style={{ flex: 1, padding: '14px' }}
                onClick={() => { setScannedProduct(null); setIsScanning(true); }}
              >
                Skip / Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--danger)' }}>
            <p>{error}</p>
            <button className="btn-primary" onClick={onClose}>Close</button>
          </div>
        )}
      </div>

      <footer style={{ marginTop: '20px', paddingBottom: '20px', textAlign: 'center' }}>
        <button 
          className="btn-primary" 
          onClick={onClose}
          style={{ width: '100%', maxWidth: '300px', height: '56px', fontSize: '1.1rem', background: '#059669' }}
        >
          Check out Items
        </button>
      </footer>
    </div>
  );
}

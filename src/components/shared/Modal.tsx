import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Modal({ isOpen, onClose, title, children, maxWidth = '500px' }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div style={{ 
      position: 'fixed', 
      inset: 0, 
      background: 'rgba(0,0,0,0.6)', 
      backdropFilter: 'blur(4px)',
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      zIndex: 1000,
      padding: '20px'
    }} onClick={onClose}>
      <div 
        className="card modal-responsive" 
        style={{ 
          width: '100%', 
          maxWidth, 
          maxHeight: '90vh', 
          overflowY: 'auto',
          animation: 'auth-fade 0.3s ease-out',
          position: 'relative'
        }} 
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'transparent', padding: '4px', display: 'flex' }}>
            <X size={24} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

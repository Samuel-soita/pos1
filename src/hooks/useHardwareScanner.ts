import { useEffect, useRef } from 'react';

/**
 * Hook to detect hardware barcode scanner input.
 * Hardware scanners usually act as HID (Keyboard) and type digits rapidly followed by 'Enter'.
 */
export function useHardwareScanner(onScan: (barcode: string) => void) {
  const bufferRef = useRef<string[]>([]);
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Hardware scanners are extremely fast (usually < 20ms between keys)
      // Manually typing is usually > 80ms.
      // We use a safe margin of 50ms.
      const isFast = timeDiff < 50;

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= 3) { // Most barcodes are 3+ digits
          const barcode = bufferRef.current.join('');
          onScan(barcode);
        }
        bufferRef.current = [];
      } else if (e.key.length === 1) { // Normal character
        // If it's been too long since the last key, reset the buffer
        // unless it's the very first character.
        if (!isFast && bufferRef.current.length > 0) {
          bufferRef.current = [];
        }
        bufferRef.current.push(e.key);
      }

      // If we've been buffering and it's suddenly slow, it's probably a human typing.
      // We clear the buffer to avoid mis-scans.
      if (!isFast && bufferRef.current.length > 0) {
        // Optional: wait a tiny bit to be sure? No, 50ms is standard for HID scanners.
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScan]);
}

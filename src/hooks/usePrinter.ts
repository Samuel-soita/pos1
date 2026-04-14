import { useState, useCallback, useEffect, useRef } from 'react';
import type { Sale } from '../db/db';
import { EscPosEncoder } from '../lib/escpos';

// Type definitions for Web Bluetooth, USB, and Serial APIs
interface BluetoothCharacteristic {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue: (data: Uint8Array) => Promise<void>;
  writeValueWithoutResponse: (data: Uint8Array) => Promise<void>;
}

interface BluetoothDevice extends EventTarget {
  gatt?: {
    connected: boolean;
    connect: () => Promise<void>;
    getPrimaryServices: () => Promise<{ getCharacteristics: () => Promise<BluetoothCharacteristic[]> }[]>;
  };
  name?: string;
}

export function usePrinter() {
  const [btDevice, setBtDevice] = useState<BluetoothDevice | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [usbDevice, setUsbDevice] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [serialPort, setSerialPort] = useState<any>(null);
  
  const [isPrinting, setIsPrinting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [transport, setTransport] = useState<'BT' | 'USB' | 'SERIAL' | null>(null);
  
  const reconnectIntervalRef = useRef<number | null>(null);

  const establishUSB = useCallback(async (device: { open: () => Promise<void>, selectConfiguration: (n: number) => Promise<void>, claimInterface: (n: number) => Promise<void> }) => {
    await device.open();
    await device.selectConfiguration(1);
    await device.claimInterface(0);
    setUsbDevice(device);
    setTransport('USB');
    localStorage.setItem('preferred_printer', 'USB');
  }, []);

  const establishSerial = useCallback(async (port: { open: (opts: { baudRate: number }) => Promise<void> }) => {
    await port.open({ baudRate: 9600 });
    setSerialPort(port);
    setTransport('SERIAL');
    localStorage.setItem('preferred_printer', 'SERIAL');
  }, []);

  // Break cycle with ref for triggerAutoReconnect
  const triggerAutoReconnectRef = useRef<(failedTransport: 'BT' | 'USB' | 'SERIAL') => void>(() => {});

  const handleBTDisconnect = useCallback(() => {
    setTransport(null);
    setBtDevice(null);
    if (triggerAutoReconnectRef.current) {
      triggerAutoReconnectRef.current('BT');
    }
  }, []);

  const establishBT = useCallback(async (device: BluetoothDevice) => {
    if (device.gatt && !device.gatt.connected) {
      await device.gatt.connect();
    }
    device.addEventListener('gattserverdisconnected', handleBTDisconnect);
    setBtDevice(device);
    setTransport('BT');
    localStorage.setItem('preferred_printer', 'BT');
  }, [handleBTDisconnect]);

  const triggerAutoReconnect = useCallback((failedTransport: 'BT' | 'USB' | 'SERIAL') => {
    setIsReconnecting(true);
    let attempts = 0;
    const maxAttempts = 24; // 120 seconds max

    if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);

    reconnectIntervalRef.current = window.setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);
        setIsReconnecting(false);
        return;
      }

      try {
        if (failedTransport === 'USB' && 'usb' in navigator) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const devices = await (navigator as any).usb.getDevices();
          if (devices.length > 0) {
            await establishUSB(devices[0]);
            setIsReconnecting(false);
            if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);
          }
        } else if (failedTransport === 'SERIAL' && 'serial' in navigator) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ports = await (navigator as any).serial.getPorts();
          if (ports.length > 0) {
            await establishSerial(ports[0]);
            setIsReconnecting(false);
            if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);
          }
        } else if (failedTransport === 'BT' && 'bluetooth' in navigator) {
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           if (typeof (navigator.bluetooth as any).getDevices === 'function') {
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             const devices = await (navigator.bluetooth as any).getDevices();
             if (devices.length > 0) {
                await establishBT(devices[0]);
                setIsReconnecting(false);
                if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);
             }
           }
        }
      } catch {
        // Silently fail and let loop retry
      }
    }, 5000);
  }, [establishUSB, establishSerial, establishBT]);

  useEffect(() => {
    triggerAutoReconnectRef.current = triggerAutoReconnect;
  }, [triggerAutoReconnect]);

  useEffect(() => {
    const onUsbDisconnect = () => {
      setTransport(t => {
        if (t === 'USB') {
           setUsbDevice(null);
           triggerAutoReconnect('USB');
        }
        return null; // Will trigger re-render
      });
    };

    const onSerialDisconnect = () => {
      setTransport(t => {
         if (t === 'SERIAL') {
            setSerialPort(null);
            triggerAutoReconnect('SERIAL');
         }
         return null;
      });
    };

    if ('usb' in navigator) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator as any).usb.addEventListener('disconnect', onUsbDisconnect);
    }
    if ('serial' in navigator) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator as any).serial.addEventListener('disconnect', onSerialDisconnect);
    }

    return () => {
      if ('usb' in navigator) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).usb.removeEventListener('disconnect', onUsbDisconnect);
      }
      if ('serial' in navigator) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).serial.removeEventListener('disconnect', onSerialDisconnect);
      }
    };
  }, [triggerAutoReconnect]);

  useEffect(() => {
    const saved = localStorage.getItem('preferred_printer');
    if (saved) {
      triggerAutoReconnect(saved as 'BT' | 'USB' | 'SERIAL');
    }
  }, [triggerAutoReconnect]);

  const connectBT = async () => {
    try {
      // @ts-expect-error - BT API
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2']
      });
      await establishBT(device);
      return true;
    } catch (e) {
      console.warn("BT failed:", e);
      return false;
    }
  };

  const connectUSB = async () => {
    try {
      // @ts-expect-error - USB API
      const device = await navigator.usb.requestDevice({ filters: [] });
      await establishUSB(device);
      return true;
    } catch (e) {
      console.warn("USB failed:", e);
      return false;
    }
  };

  const connectSerial = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const port = await (navigator as any).serial.requestPort();
      await establishSerial(port);
      return true;
    } catch (e) {
      console.warn("Serial failed:", e);
      return false;
    }
  };
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writeChunked = async (transportType: 'BT' | 'USB' | 'SERIAL', device: any, data: Uint8Array) => {
    const CHUNK_SIZE = 512;
    
    if (transportType === 'BT') {
      const gatt = device.gatt;
      if (!gatt.connected) await gatt.connect();
      const services = await gatt.getPrimaryServices();
      let characteristic: BluetoothCharacteristic | null = null;
      for (const service of services) {
        const chars = await service.getCharacteristics();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        characteristic = chars.find((c: any) => c.properties.write || c.properties.writeWithoutResponse) || null;
        if (characteristic) break;
      }
      if (!characteristic) throw new Error("BT write characteristic not found");

      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        if (characteristic.properties.write) await characteristic.writeValue(chunk);
        else await characteristic.writeValueWithoutResponse(chunk);
        await new Promise(r => setTimeout(r, 50));
      }
    } else if (transportType === 'USB') {
      await device.transferOut(1, data);
    } else if (transportType === 'SERIAL') {
      const writer = device.writable.getWriter();
      await writer.write(data);
      writer.releaseLock();
    }
  };

  const printReceipt = useCallback(async (sale: Sale, business: { name: string; address?: string; telephone?: string; kraPin?: string }) => {
    if (!transport) return;
    setIsPrinting(true);

    try {
      const encoder = new EscPosEncoder();
      encoder.initialize().setCharTable(0).align('center');
      encoder.bold(true).text(business.name).newline().bold(false);
      
      if (business.address) encoder.text(business.address).newline();
      if (business.telephone) encoder.text(`Tel: ${business.telephone}`).newline();
      
      encoder.newline().text('--------------------------------').newline();
      encoder.align('left').text(`Date: ${new Date(sale.timestamp).toLocaleString()}`).newline();
      encoder.text(`Receipt: ${sale.receiptId}`).newline();
      encoder.text('--------------------------------').newline();

      sale.items.forEach(item => {
        encoder.text(`${item.quantity}x ${item.name}`).newline();
        encoder.align('right').text(`KES ${(item.price * item.quantity).toLocaleString()}`).newline().align('left');
      });

      encoder.text('--------------------------------').newline();
      encoder.bold(true).align('right').text(`TOTAL: KES ${sale.total.toLocaleString()}`).newline().bold(false);
      
      encoder.newline(2).align('center').text('Thank You!').newline();
      encoder.text('Powered by SMUTA PAY').newline();
      encoder.cut();

      const data = encoder.encode();
      const activeDevice = transport === 'BT' ? btDevice : transport === 'USB' ? usbDevice : serialPort;
      await writeChunked(transport, activeDevice, data);
    } catch (e) {
      console.error("Print failed:", e);
      alert(`Printing failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsPrinting(false);
    }
  }, [transport, btDevice, usbDevice, serialPort]);

  const printZReport = useCallback(async (zData: { openingFloat: number, cashSales: number, mpesaSales: number, expenses: number, expectedCash: number, salesCount: number, expensesCount: number }, business: { name: string; address?: string }) => {
    if (!transport) return;
    setIsPrinting(true);

    try {
      const encoder = new EscPosEncoder();
      encoder.initialize().setCharTable(0).align('center');
      encoder.bold(true).text('*** Z-REPORT ***').newline().bold(false);
      encoder.text(business.name).newline();
      
      encoder.newline().text('--------------------------------').newline();
      encoder.align('left').text(`Report Time: ${new Date().toLocaleString()}`).newline();
      encoder.text('--------------------------------').newline();

      encoder.text(`Opening Float: `).align('right').text(`KES ${zData.openingFloat.toLocaleString()}`).align('left').newline();
      encoder.text(`(+) Cash Sales: `).align('right').text(`KES ${zData.cashSales.toLocaleString()}`).align('left').newline();
      encoder.text(`(+) M-Pesa Sales:`).align('right').text(`KES ${zData.mpesaSales.toLocaleString()}`).align('left').newline();
      encoder.text(`(-) Expenses: `).align('right').text(`KES ${zData.expenses.toLocaleString()}`).align('left').newline();
      
      encoder.text('--------------------------------').newline();
      encoder.bold(true).text(`EXPECTED CASH: `).align('right').text(`KES ${zData.expectedCash.toLocaleString()}`).align('left').bold(false).newline();
      encoder.text('--------------------------------').newline();

      encoder.newline();
      encoder.text(`Sales Transactions: ${zData.salesCount}`).newline();
      encoder.text(`Expense Records:    ${zData.expensesCount}`).newline();
      
      encoder.newline(3).text('................................').newline();
      encoder.text('Verified By / Signature').newline();

      encoder.newline(2).align('center').text('Powered by SMUTA PAY').newline();
      encoder.cut();

      const data = encoder.encode();
      const activeDevice = transport === 'BT' ? btDevice : transport === 'USB' ? usbDevice : serialPort;
      await writeChunked(transport, activeDevice, data);
    } catch (e) {
      console.error("Z-Report Print failed:", e);
      alert(`Printing failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsPrinting(false);
    }
  }, [transport, btDevice, usbDevice, serialPort]);

  return {
    connectBT,
    connectUSB,
    connectSerial,
    printReceipt,
    printZReport,
    isPrinting,
    isReconnecting,
    transport,
    isConnected: !!transport,
    deviceName: btDevice?.name || usbDevice?.productName || 'Serial Printer',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isSupported: 'bluetooth' in navigator || 'usb' in navigator || 'serial' in (navigator as any)
  };
}

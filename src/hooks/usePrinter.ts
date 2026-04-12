import { useState, useCallback } from 'react';
import type { Sale } from '../db/db';
import { EscPosEncoder } from '../lib/escpos';

// Type definitions for Web Bluetooth, USB, and Serial APIs
interface BluetoothCharacteristic {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue: (data: Uint8Array) => Promise<void>;
  writeValueWithoutResponse: (data: Uint8Array) => Promise<void>;
}

interface BluetoothDevice {
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
  const [transport, setTransport] = useState<'BT' | 'USB' | 'SERIAL' | null>(null);

  const connectBT = async () => {
    try {
      // @ts-expect-error - BT API
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2']
      });
      setBtDevice(device);
      setTransport('BT');
      setUsbDevice(null);
      setSerialPort(null);
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
      await device.open();
      await device.selectConfiguration(1);
      await device.claimInterface(0);
      setUsbDevice(device);
      setTransport('USB');
      setBtDevice(null);
      setSerialPort(null);
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
      await port.open({ baudRate: 9600 });
      setSerialPort(port);
      setTransport('SERIAL');
      setBtDevice(null);
      setUsbDevice(null);
      return true;
    } catch (e) {
      console.warn("Serial failed:", e);
      return false;
    }
  };
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writeChunked = async (transport: 'BT' | 'USB' | 'SERIAL', device: any, data: Uint8Array) => {
    const CHUNK_SIZE = 512;
    
    if (transport === 'BT') {
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
    } else if (transport === 'USB') {
      // Most thermal printers use Endpoint 1 for out
      await device.transferOut(1, data);
    } else if (transport === 'SERIAL') {
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

  return {
    connectBT,
    connectUSB,
    connectSerial,
    printReceipt,
    isPrinting,
    transport,
    isConnected: !!transport,
    deviceName: btDevice?.name || usbDevice?.productName || 'Serial Printer',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isSupported: 'bluetooth' in navigator || 'usb' in navigator || 'serial' in (navigator as any)
  };
}

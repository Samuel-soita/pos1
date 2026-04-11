import { useState, useCallback } from 'react';
import type { Sale } from '../db/db';
import { EscPosEncoder } from '../lib/escpos';

// Basic typing for Web Bluetooth API
interface BluetoothCharacteristic {
  properties: {
    write: boolean;
    writeWithoutResponse: boolean;
  };
  writeValue: (data: Uint8Array) => Promise<void>;
  writeValueWithoutResponse: (data: Uint8Array) => Promise<void>;
}

interface BluetoothService {
  getCharacteristics: () => Promise<BluetoothCharacteristic[]>;
}

interface BluetoothDevice {
  gatt?: {
    connected: boolean;
    connect: () => Promise<void>;
    getPrimaryServices: () => Promise<BluetoothService[]>;
  };
  name?: string;
}

export function usePrinter() {
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const connect = async () => {
    try {
      // @ts-expect-error - navigator.bluetooth is a modern API not yet in standard TS definitions
      const selectedDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2']
      });
      setDevice(selectedDevice);
      alert(`Connected to scanner/printer: ${selectedDevice.name}`);
      return true;
    } catch (e: unknown) {
      const error = e as Error;
      console.warn("Bluetooth pairing cancelled or failed:", error);
      return false;
    }
  };

  const getCharacteristic = async (btDevice: BluetoothDevice) => {
    if (!btDevice.gatt) return null;
    if (!btDevice.gatt.connected) {
      await btDevice.gatt.connect();
    }
    const services = await btDevice.gatt.getPrimaryServices();
    if (!services || services.length === 0) return null;
    
    // Find the first service with a writable characteristic (typical for POS)
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          return char;
        }
      }
    }
    return null;
  };

  const writeChunked = async (characteristic: BluetoothCharacteristic, data: Uint8Array) => {
    const CHUNK_SIZE = 512;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      if (characteristic.properties.write) {
        await characteristic.writeValue(chunk);
      } else {
        await characteristic.writeValueWithoutResponse(chunk);
      }
      
      // Small pause to let printer buffer drain
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };

  const printReceipt = useCallback(async (sale: Sale, business: { name: string; address?: string; telephone?: string; kraPin?: string }) => {
    if (!device) {
      console.warn("No device paired. Skipping bluetooth print.");
      return;
    }

    setIsPrinting(true);
    try {
      const characteristic = await getCharacteristic(device);
      if (!characteristic) throw new Error("Could not negotiate a writable connection.");

      const encoder = new EscPosEncoder();
      encoder.initialize();
      encoder.align('center');
      encoder.bold(true).text(business?.name || 'Store').newline();
      encoder.bold(false);
      
      if (business?.address) encoder.text(business.address).newline();
      if (business?.telephone) encoder.text(`Tel: ${business.telephone}`).newline();
      if (business?.kraPin) encoder.text(`PIN: ${business.kraPin}`).newline();
      
      encoder.bold(true).text('SMUTA PAY RECEIPT').bold(false).newline(2);

      encoder.align('left');
      encoder.text(`Date: ${new Date(sale.timestamp).toLocaleString()}`).newline();
      encoder.text(`Receipt: ${sale.receiptId}`).newline();
      encoder.text('--------------------------------').newline(); // Assumes 32 chars width (standard 58mm)

      sale.items.forEach(item => {
        const itemLine = `${item.quantity}x ${item.name}`;
        const price = `$${(item.price * item.quantity).toFixed(2)}`;
        encoder.text(itemLine).newline();
        encoder.align('right').text(price).newline().align('left');
      });

      encoder.text('--------------------------------').newline();
      
      if (sale.taxRate && sale.taxRate > 0) {
        const taxLine = `Tax (${sale.taxRate}%): $${(sale.taxAmount || 0).toFixed(2)}`;
        encoder.align('right').text(taxLine).newline();
      }

      encoder.bold(true);
      encoder.text(`TOTAL PAID (${sale.paymentMethod || 'CASH'}): $${sale.total.toFixed(2)}`).newline();
      encoder.bold(false);

      encoder.newline(2).align('center').text('Thank You!').newline();
      encoder.text('Powered by SMUTA PAY').newline(4);
      encoder.cut();

      await writeChunked(characteristic, encoder.encode());
    } catch (err: unknown) {
      const error = err as Error;
      console.error(error);
      alert(`Bluetooth Printing failed: ${error.message}`);
    } finally {
      setIsPrinting(false);
    }
  }, [device]);

  return { 
    connect, 
    printReceipt, 
    isPrinting, 
    isConnected: !!device, 
    deviceName: device?.name,
    isSupported: 'bluetooth' in navigator 
  };
}

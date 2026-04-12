export class EscPosEncoder {
  private buffer: number[] = [];

  constructor() {
    this.buffer = [];
  }

  /**
   * Initialize printer (Reset to defaults)
   */
  initialize() {
    this.buffer.push(0x1B, 0x40);
    return this;
  }

  /**
   * Set character code table (Standard: 0 = PC437)
   */
  setCharTable(table: number = 0) {
    this.buffer.push(0x1B, 0x74, table);
    return this;
  }

  text(str: string) {
    for (let i = 0; i < str.length; i++) {
      this.buffer.push(str.charCodeAt(i));
    }
    return this;
  }

  /**
   * Line feed
   */
  newline(count = 1) {
    for (let i = 0; i < count; i++) {
      this.buffer.push(0x0A);
    }
    return this;
  }

  /**
   * Paper feed (n lines) - ESC d n
   */
  feed(n: number = 3) {
    this.buffer.push(0x1B, 0x64, n);
    return this;
  }

  bold(on: boolean) {
    this.buffer.push(0x1B, 0x45, on ? 1 : 0);
    return this;
  }

  align(position: 'left' | 'center' | 'right') {
    let mode = 0;
    if (position === 'center') mode = 1;
    if (position === 'right') mode = 2;
    this.buffer.push(0x1B, 0x61, mode);
    return this;
  }

  /**
   * Full cut with paper feed
   * GS V m n (Standard for modern printers)
   */
  cut() {
    // Feed first to ensure last line is past the blade
    this.feed(4);
    
    // Command combinations for maximum compatibility:
    // 1. GS V 66 0 (Standard GS V cut)
    this.buffer.push(0x1D, 0x56, 42, 0); 
    
    // 2. Legacy ESC i / ESC m fallback (often ignored if GS V works)
    this.buffer.push(0x1B, 0x69); 
    return this;
  }

  /**
   * Send raw bytes to the printer
   */
  raw(bytes: number[] | Uint8Array) {
    const arr = Array.from(bytes);
    this.buffer.push(...arr);
    return this;
  }

  encode(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

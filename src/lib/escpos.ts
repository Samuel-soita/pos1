export class EscPosEncoder {
  private buffer: number[] = [];

  constructor() {
    this.buffer = [];
  }

  initialize() {
    this.buffer.push(0x1B, 0x40);
    return this;
  }

  text(str: string) {
    for (let i = 0; i < str.length; i++) {
      this.buffer.push(str.charCodeAt(i));
    }
    return this;
  }

  newline(count = 1) {
    for (let i = 0; i < count; i++) {
      this.buffer.push(0x0A);
    }
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

  cut() {
    // 0x1D 0x56 0x00 : Full cut
    this.buffer.push(0x1D, 0x56, 0x00);
    return this;
  }

  encode(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Cryptographic hashing utilities for Event-Sourced integrity.
 */

/**
 * Generates a SHA-256 hash of an event payload to ensure data integrity.
 * This prevents tampering with transaction data before it hits the cloud.
 */
export async function generateEventHash(payload: unknown): Promise<string> {
  try {
    const msgUint8 = new TextEncoder().encode(JSON.stringify(payload));
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (e) {
    console.warn("Hashing failed, falling back to basic hash:", e);
    // Simple fallback if SubtleCrypto is unavailable (though extremely unlikely in modern browsers)
    const str = JSON.stringify(payload);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'L1-' + Math.abs(hash).toString(16);
  }
}

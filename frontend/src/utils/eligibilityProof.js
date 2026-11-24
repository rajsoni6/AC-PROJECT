function modPow(base, exponent, modulus) {
  let result = 1n;
  base %= modulus;
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % modulus;
    exponent >>= 1n;
    base = (base * base) % modulus;
  }
  return result;
}

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createEligibilityProof(qrToken, secretValue, params, electionId) {
  if (!window.crypto?.subtle || !window.crypto?.getRandomValues) {
    throw new Error("This browser cannot create the required eligibility proof.");
  }
  const envelope = JSON.parse(window.atob(qrToken));
  const nullifier = envelope.payload.nullifier;
  const publicKey = window.BigInt(envelope.payload.credential_public_key);
  const p = window.BigInt(params.p);
  const g = window.BigInt(params.g);
  const q = window.BigInt(params.q);
  const secret = window.BigInt(secretValue);

  const randomBytes = window.crypto.getRandomValues(new Uint8Array(32));
  const nonce = toHex(randomBytes);
  const k = (window.BigInt(`0x${nonce}`) % (q - 1n)) + 1n;
  const commitment = modPow(g, k, p).toString();
  const transcript = `eligibility-v1:${electionId}:${nullifier}:${nonce}:${commitment}:${publicKey}`;
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(transcript));
  const challenge = window.BigInt(`0x${toHex(new Uint8Array(digest))}`) % q;
  const response = (k + challenge * secret) % q;

  return { nonce, commitment, response: response.toString() };
}

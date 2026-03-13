/**
 * WebCrypto-based cryptographic utilities (Isomorphic/Browser-safe).
 */
export class IsomorphicCrypto {
    private static crypto = typeof globalThis !== 'undefined' && globalThis.crypto 
        ? globalThis.crypto 
        : (typeof require !== 'undefined' ? eval('require')('node:crypto').webcrypto : null);

    /** Generate a random ID string */
    static randomID(len = 16): string {
        const bytes = new Uint8Array(len / 2);
        if (this.crypto) {
            this.crypto.getRandomValues(bytes);
        } else {
            for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        }
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /** Sign data using Ed25519 private key (Base64) */
    static async signEd25519(payload: string | Uint8Array, privateKeyB64: string): Promise<string> {
        if (!this.crypto) throw new Error('WebCrypto not available');
        
        const privKeyBuf = this.fromBase64(privateKeyB64);
        const key = await this.crypto.subtle.importKey(
            'pkcs8',
            privKeyBuf,
            { name: 'Ed25519' },
            false,
            ['sign']
        );

        const data = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
        const signature = await this.crypto.subtle.sign(
            { name: 'Ed25519' },
            key,
            data
        );

        return this.toBase64(new Uint8Array(signature));
    }

    /** Verify Ed25519 signature */
    static async verifyEd25519(signatureB64: string, payload: string | Uint8Array, publicKeyB64: string): Promise<boolean> {
        if (!this.crypto) return false;

        try {
            const pubKeyBuf = this.fromBase64(publicKeyB64);
            const key = await this.crypto.subtle.importKey(
                'spki',
                pubKeyBuf,
                { name: 'Ed25519' },
                false,
                ['verify']
            );

            const data = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
            const signature = this.fromBase64(signatureB64);

            return await this.crypto.subtle.verify(
                { name: 'Ed25519' },
                key,
                signature,
                data
            );
        } catch (err) {
            return false;
        }
    }

    /** Helper: bytes to Base64 (isomorphic) */
    static toBase64(bytes: Uint8Array): string {
        if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
        const binString = Array.from(bytes).map(x => String.fromCharCode(x)).join('');
        return globalThis.btoa(binString);
    }

    /** Helper: Base64 to Uint8Array (isomorphic) */
    static fromBase64(b64: string): Uint8Array {
        if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
        const binString = globalThis.atob(b64);
        return Uint8Array.from(binString, (m) => m.charCodeAt(0));
    }
}

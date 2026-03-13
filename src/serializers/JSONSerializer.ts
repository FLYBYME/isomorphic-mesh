import { BaseSerializer } from './BaseSerializer';

/**
 * JSONSerializer — standard JSON-based serialization.
 */
export class JSONSerializer extends BaseSerializer {
    readonly type = 'json';
    private encoder = new TextEncoder();
    private decoder = new TextDecoder();

    serialize(data: Record<string, unknown>): Uint8Array {
        return this.encoder.encode(JSON.stringify(data));
    }

    deserialize(raw: Uint8Array | ArrayBuffer | string): Record<string, unknown> {
        let str: string;

        if (typeof raw === 'string') {
            str = raw;
        } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
            str = (raw as Buffer).toString('utf-8');
        } else {
            str = this.decoder.decode(raw as Uint8Array | ArrayBuffer);
        }

        return JSON.parse(str) as Record<string, unknown>;
    }

    private isBuffer(raw: unknown): raw is { toString(enc: string): string } {
        return typeof Buffer !== 'undefined' && Buffer.isBuffer(raw);
    }
}

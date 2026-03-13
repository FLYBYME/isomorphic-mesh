import { BaseSerializer } from './BaseSerializer';

export class ProtoBufSerializer extends BaseSerializer {
    readonly type = 'protobuf';
    private encoder = new TextEncoder();
    private decoder = new TextDecoder();

    serialize(data: Record<string, unknown>): Uint8Array {
        return this.encoder.encode(JSON.stringify(data));
    }

    deserialize(buf: Uint8Array | ArrayBuffer | string): Record<string, unknown> {
        const str = typeof buf === 'string' ? buf : this.decoder.decode(buf);
        return JSON.parse(str) as Record<string, unknown>;
    }
}

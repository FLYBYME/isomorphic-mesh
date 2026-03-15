import { IInterceptor, IMeshPacket } from 'isomorphic-core';
import { Env } from '../utils/Env';

/**
 * CompressionInterceptor — Automatically compresses large payloads using Gzip/Brotli.
 */
export class CompressionInterceptor implements IInterceptor<IMeshPacket, IMeshPacket> {
    public readonly name = 'compression';
    private readonly THRESHOLD = 1024; // 1KB

    async onOutbound(packet: IMeshPacket): Promise<IMeshPacket> {
        if (!Env.isNode()) return packet;
        if (!packet.data || typeof packet.data !== 'object') return packet;

        const zlib = eval('require')('node:zlib');
        const payload = JSON.stringify(packet.data);
        
        if (payload.length > this.THRESHOLD) {
            const compressed = zlib.gzipSync(Buffer.from(payload));
            return {
                ...packet,
                data: compressed.toString('base64'),
                meta: { ...packet.meta, compression: 'gzip' }
            };
        }

        return packet;
    }

    async onInbound(packet: IMeshPacket): Promise<IMeshPacket> {
        if (!Env.isNode()) return packet;
        if (packet.meta?.compression === 'gzip' && typeof packet.data === 'string') {
            const zlib = eval('require')('node:zlib');
            const decompressed = zlib.gunzipSync(Buffer.from(packet.data, 'base64'));
            return {
                ...packet,
                data: JSON.parse(decompressed.toString('utf-8'))
            };
        }
        return packet;
    }
}

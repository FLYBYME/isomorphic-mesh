import { TCPFrameCodec } from '../src/transports/helpers/TCPFrameCodec';
import { WirePacketType } from '../src/types/mesh.types';

describe('TCPFrameCodec', () => {
    it('TCP Frame Codec: correctly handles message fragmentation and reassembly', () => {
        const payload = new Uint8Array([1, 2, 3, 4, 5]);
        const msgID = '1234567890123456';
        const encoded = TCPFrameCodec.encode(WirePacketType.RPC_REQ, msgID, payload);
        
        // 1 + 16 + 4 + 5 = 26 bytes
        expect(encoded.length).toBe(26);

        // Test fragmentation - split the buffer in two
        const part1 = encoded.slice(0, 10);
        const part2 = encoded.slice(10);

        const decode1 = TCPFrameCodec.decode(part1);
        expect(decode1.frame).toBeNull();
        expect(decode1.remaining.length).toBe(10);

        // Combine and decode
        const combined = new Uint8Array(decode1.remaining.length + part2.length);
        combined.set(decode1.remaining);
        combined.set(part2, decode1.remaining.length);

        const decode2 = TCPFrameCodec.decode(combined);
        expect(decode2.frame).not.toBeNull();
        expect(decode2.frame!.length).toBe(26);
        expect(decode2.remaining.length).toBe(0);
    });

    it('Large Payload Handling: rejects payloads exceeding MAX_FRAME_SIZE', () => {
        const largePayload = new Uint8Array(TCPFrameCodec.MAX_FRAME_SIZE + 1);
        expect(() => TCPFrameCodec.encode(WirePacketType.RPC_REQ, '123', largePayload))
            .toThrow(/exceeds maximum frame size/);
    });
});

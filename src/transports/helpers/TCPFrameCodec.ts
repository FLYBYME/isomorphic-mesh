import { WirePacketType } from '../../types/mesh.types';
import { Env } from '../../utils/Env';

export interface IDecodedFrame {
    frame: Uint8Array | null;
    remaining: Uint8Array;
}

/**
 * TCPFrameCodec — handles framing for raw TCP connections.
 * 
 * Layout: [Type(1)] [MsgID(16)] [Length(4)] [Payload(N)]
 */
export class TCPFrameCodec {
    /** 
     * Maximum allowed frame size (10MB). 
     * Prevents Out-Of-Memory DoS attacks.
     */
    public static readonly MAX_FRAME_SIZE = 10 * 1024 * 1024;

    static encode(type: WirePacketType, msgID: string, payload: Uint8Array): Uint8Array {
        if (!Env.isNode()) return new Uint8Array(0);
        
        const Buffer = eval('require')('buffer').Buffer;
        
        if (payload.length > this.MAX_FRAME_SIZE) {
            throw new Error(`Payload size ${payload.length} exceeds maximum frame size ${this.MAX_FRAME_SIZE}`);
        }

        const msgIDBuf = Buffer.alloc(16, ' ');
        msgIDBuf.write(msgID.slice(0, 16));

        const header = Buffer.alloc(1 + 16 + 4);
        header.writeUInt8(type, 0);
        msgIDBuf.copy(header, 1);
        header.writeUInt32BE(payload.length, 1 + 16);

        return Buffer.concat([header, payload]);
    }

    static decode(buffer: Uint8Array): IDecodedFrame {
        if (!Env.isNode()) return { frame: null, remaining: buffer };
        
        const Buffer = eval('require')('buffer').Buffer;
        const buf = Buffer.from(buffer);

        if (buf.length < 21) return { frame: null, remaining: buffer };

        const payloadLen = buf.readUInt32BE(1 + 16);
        
        if (payloadLen > this.MAX_FRAME_SIZE) {
            throw new Error(`Incoming payload size ${payloadLen} exceeds maximum frame size ${this.MAX_FRAME_SIZE}`);
        }

        const totalLen = 1 + 16 + 4 + payloadLen;

        if (buf.length < totalLen) return { frame: null, remaining: buffer };

        return {
            frame: new Uint8Array(buf.subarray(0, totalLen)),
            remaining: new Uint8Array(buf.subarray(totalLen))
        };
    }
}

import { WirePacketType } from '../../types/mesh.types';
import { Env } from '../../utils/Env';

export interface IDecodedFrame {
    frame: Uint8Array | null;
    remaining: Uint8Array;
}

export class TCPFrameCodec {
    static encode(type: WirePacketType, msgID: string, payload: Uint8Array): Uint8Array {
        if (!Env.isNode()) return new Uint8Array(0);
        
        const Buffer = eval('require')('buffer').Buffer;
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
        const totalLen = 1 + 16 + 4 + payloadLen;

        if (buf.length < totalLen) return { frame: null, remaining: buffer };

        return {
            frame: buf.subarray(0, totalLen),
            remaining: buf.subarray(totalLen)
        };
    }
}

import { PeerState, WirePacketType } from '../../types/mesh.types';
import { TCPTransport } from '../TCPTransport';
import { Env } from '../../utils/Env';
import { TCPFrameCodec } from './TCPFrameCodec';

export class TCPAuthHandler {
    constructor(private transport: TCPTransport) { }

    handleAuth(peer: PeerState, payload: Uint8Array): void {
        if (!Env.isNode()) return;
        
        try {
            const data = JSON.parse(new TextDecoder().decode(payload)) as { type: string, nodeID: string };
            if (data.type === 'response') {
                peer.nodeID = data.nodeID;
                peer.isAuthenticated = true;
                peer.isChoked = false;
                if (peer.nodeID) {
                    this.transport.peers.set(peer.nodeID, peer);
                }
                this.transport.emit('peer:connect', peer.nodeID);
            } else if (data.type === 'challenge') {
                const response = JSON.stringify({
                    type: 'response',
                    nodeID: this.transport.getNodeID()
                });
                const frame = TCPFrameCodec.encode(
                    WirePacketType.AUTH,
                    'handshake',
                    new TextEncoder().encode(response)
                );
                this.writeToSocket(peer.socket, frame);
            }
        } catch (err) {
            this.destroySocket(peer.socket);
        }
    }

    private writeToSocket(socket: unknown, data: Uint8Array): void {
        const s = socket as { write(d: Uint8Array): void };
        s.write(data);
    }

    private destroySocket(socket: unknown): void {
        const s = socket as { destroy(): void };
        s.destroy();
    }
}

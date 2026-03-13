import { BaseTransport } from './BaseTransport';
import { BaseSerializer } from '../serializers/BaseSerializer';
import { WirePacketType, PeerState, TransportConnectOptions, ITransportSocket } from '../types/mesh.types';
import { Env } from '../utils/Env';
import { TCPFrameCodec } from './helpers/TCPFrameCodec';
import { TCPAuthHandler } from './helpers/TCPAuthHandler';

export interface INodeSocket extends ITransportSocket {
    on(event: string, cb: (data: any) => void): void;
    write(data: Uint8Array): void;
    destroy(): void;
    address(): { port: number };
}

export class TCPTransport extends BaseTransport {
    readonly protocol = 'tcp';
    public server: { listen(port: number, cb: () => void): void; close(cb: () => void): void; on(ev: string, cb: any): void } | null = null;
    public peers = new Map<string, PeerState>();
    private authHandler: TCPAuthHandler;

    constructor(serializer: BaseSerializer) {
        super(serializer);
        this.authHandler = new TCPAuthHandler(this);
    }

    getNodeID(): string {
        return this.nodeID;
    }

    async connect(opts: TransportConnectOptions): Promise<void> {
        if (!Env.isNode()) return;
        const net = eval('require')('node:net');

        this.nodeID = opts.nodeID;
        const port = opts.port || 4000;

        return new Promise((resolve, reject) => {
            this.server = net.createServer((socket: INodeSocket) => this.handleConnection(socket));
            this.server!.on('error', (err: Error) => {
                this.emit('error', err);
                reject(err);
            });
            this.server!.listen(port, () => {
                this.connected = true;
                this.emit('connected');
                resolve();
            });
        });
    }

    async disconnect(): Promise<void> {
        for (const peer of this.peers.values()) (peer.socket as INodeSocket).destroy();
        this.peers.clear();
        return new Promise((resolve) => {
            if (this.server) this.server.close(() => {
                this.connected = false;
                this.emit('disconnected');
                resolve();
            });
            else resolve();
        });
    }

    async send(nodeID: string, packet: Record<string, unknown>): Promise<void> {
        const peer = this.peers.get(nodeID);
        if (!peer || !peer.isAuthenticated) throw new Error(`Target node ${nodeID} is not connected or authenticated`);
        
        const type = (packet.type === 'response') ? WirePacketType.RPC_RES : WirePacketType.RPC_REQ;
        const payload = this.serializer.serialize(packet);
        const msgID = (packet.id as string || '0000000000000000').slice(0, 16).padEnd(16, '0');
        
        const frame = TCPFrameCodec.encode(type, msgID, payload);
        (peer.socket as INodeSocket).write(frame);
    }

    async publish(topic: string, data: Record<string, unknown>): Promise<void> {
        const payload = this.serializer.serialize({ topic, data, senderNodeID: this.nodeID });
        const msgID = '0000000000000000';
        for (const peer of this.peers.values()) {
            if (peer.isAuthenticated) {
                const frame = TCPFrameCodec.encode(WirePacketType.RPC_REQ, msgID, payload);
                (peer.socket as INodeSocket).write(frame);
            }
        }
    }

    private handleConnection(socket: INodeSocket) {
        const peer: PeerState = {
            socket,
            nodeID: null,
            isAuthenticated: false,
            isChoked: true,
            bufferPot: new Uint8Array(0)
        };

        const challenge = JSON.stringify({ type: 'challenge', nonce: Math.random().toString(36) });
        socket.write(TCPFrameCodec.encode(WirePacketType.AUTH, 'handshake', new TextEncoder().encode(challenge)));

        socket.on('data', (chunk: Uint8Array) => this.processData(peer, chunk));
        socket.on('end', () => {
            if (peer.nodeID) {
                this.peers.delete(peer.nodeID);
                this.emit('peer:disconnect', peer.nodeID);
            }
        });
        socket.on('error', (err: Error) => {
            this.emit('error', err);
            socket.destroy();
        });
    }

    private processData(peer: PeerState, chunk: Uint8Array) {
        const Buffer = eval('require')('buffer').Buffer;
        peer.bufferPot = Buffer.concat([peer.bufferPot, chunk]);
        
        while (true) {
            const { frame, remaining } = TCPFrameCodec.decode(peer.bufferPot);
            if (!frame) break;
            peer.bufferPot = remaining;
            this.dispatchFrame(peer, frame);
        }
    }

    private dispatchFrame(peer: PeerState, frame: Uint8Array) {
        if (frame.length < 21) { (peer.socket as INodeSocket).destroy(); return; }
        
        const Buffer = eval('require')('buffer').Buffer;
        const buf = Buffer.from(frame);
        
        const type = buf.readUInt8(0) as WirePacketType;
        const msgID = buf.subarray(1, 17).toString('utf8').trim();
        const payload = buf.subarray(21);

        if (!peer.isAuthenticated && type !== WirePacketType.AUTH) { (peer.socket as INodeSocket).destroy(); return; }

        switch (type) {
            case WirePacketType.AUTH:
                this.authHandler.handleAuth(peer, payload);
                break;
            case WirePacketType.RPC_REQ:
            case WirePacketType.RPC_RES:
                try {
                    const packet = this.serializer.deserialize(payload);
                    this.emit('packet', packet);
                } catch (err) { }
                break;
        }
    }

    async connectToPeer(nodeID: string, url: string): Promise<void> {
        if (!Env.isNode()) return;
        const net = eval('require')('node:net');
        const parsed = new URL(url);
        
        return new Promise((resolve, reject) => {
            const socket = net.connect(parsed.port, parsed.hostname, () => {
                const peer: PeerState = {
                    socket,
                    nodeID,
                    isAuthenticated: false,
                    isChoked: true,
                    bufferPot: new Uint8Array(0)
                };
                
                socket.on('data', (chunk: Uint8Array) => this.processData(peer, chunk));
                socket.on('end', () => {
                    this.peers.delete(nodeID);
                    this.emit('peer:disconnect', nodeID);
                });
                
                resolve();
            });
            socket.on('error', reject);
        });
    }
}

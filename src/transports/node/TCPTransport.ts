import { BaseTransport } from '../BaseTransport';
import { BaseSerializer } from '../../serializers/BaseSerializer';
import { WirePacketType, PeerState, TransportConnectOptions, ITransportSocket, ILogger, IServiceRegistry } from '../../types/mesh.types';
import { TCPFrameCodec } from '../helpers/TCPFrameCodec';
import { TCPAuthHandler } from '../helpers/TCPAuthHandler';
import { IsomorphicCrypto } from '../../utils/Crypto';
import net from 'node:net';

export interface INodeSocket extends ITransportSocket {
    on(event: string, cb: (data: any) => void): void;
    write(data: Uint8Array): void;
    destroy(): void;
    address(): any;
}

/**
 * TCPTransport — Node.js implementation using 'node:net'.
 */
export class TCPTransport extends BaseTransport {
    readonly protocol = 'tcp';
    public server: net.Server | null = null;
    public peers = new Map<string, PeerState>();
    private authHandler: TCPAuthHandler;
    
    public privateKey?: string;
    public registry?: IServiceRegistry;
    public logger?: ILogger;

    constructor(serializer: BaseSerializer) {
        super(serializer);
        this.authHandler = new TCPAuthHandler(this);
    }

    getNodeID(): string {
        return this.nodeID;
    }

    async connect(opts: TransportConnectOptions): Promise<void> {
        this.nodeID = opts.nodeID;
        this.logger = opts.logger;
        this.privateKey = (opts as any).privateKey;
        this.registry = (opts as any).registry;

        const port = opts.port || 4000;

        return new Promise((resolve, reject) => {
            this.server = net.createServer((socket: any) => this.handleConnection(socket as INodeSocket));
            this.server.on('error', (err: Error) => {
                this.emit('error', err);
                reject(err);
            });
            this.server.listen(port, () => {
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
        
        const type = (packet.type === 'RESPONSE' || packet.type === 'RESPONSE_ERROR') ? WirePacketType.RPC_RES : WirePacketType.RPC_REQ;
        const payload = this.serializer.serialize(packet);
        const msgID = (packet.id as string || '0000000000000000').slice(0, 16).padEnd(16, '0');
        
        const frame = TCPFrameCodec.encode(type, msgID, payload);
        (peer.socket as INodeSocket).write(frame);
    }

    async publish(topic: string, data: Record<string, unknown>): Promise<void> {
        const payload = this.serializer.serialize({ topic, data, senderNodeID: this.nodeID, type: 'EVENT' });
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

        const nonce = IsomorphicCrypto.randomID(16);
        const challenge = JSON.stringify({ type: 'challenge', nonce });
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
        if (peer.bufferPot.length + chunk.length > TCPFrameCodec.MAX_FRAME_SIZE + 21) {
            this.logger?.error(`[TCPTransport] Buffer overflow from ${peer.nodeID || 'unknown'}. Closing.`);
            (peer.socket as INodeSocket).destroy();
            return;
        }

        const combined = new Uint8Array(peer.bufferPot.length + chunk.length);
        combined.set(peer.bufferPot);
        combined.set(chunk, peer.bufferPot.length);
        peer.bufferPot = combined;
        
        try {
            while (true) {
                const { frame, remaining } = TCPFrameCodec.decode(peer.bufferPot);
                if (!frame) break;
                peer.bufferPot = remaining;
                this.dispatchFrame(peer, frame);
            }
        } catch (err: any) {
            this.logger?.error(`[TCPTransport] Framing error: ${err.message}`);
            (peer.socket as INodeSocket).destroy();
        }
    }

    private async dispatchFrame(peer: PeerState, frame: Uint8Array) {
        if (frame.length < 21) { (peer.socket as INodeSocket).destroy(); return; }
        
        const type = frame[0] as WirePacketType;
        const payload = frame.subarray(21);

        if (!peer.isAuthenticated && type !== WirePacketType.AUTH) { 
            (peer.socket as INodeSocket).destroy(); 
            return; 
        }

        switch (type) {
            case WirePacketType.AUTH:
                await this.authHandler.handleAuth(peer, payload);
                if (peer.isAuthenticated) this.startHeartbeat(peer);
                break;
            case WirePacketType.PING:
                // Auto-reply with PONG (re-using AUTH type for now or same type)
                (peer.socket as INodeSocket).write(TCPFrameCodec.encode(WirePacketType.PING, 'pong', new Uint8Array(0)));
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

    private startHeartbeat(peer: PeerState) {
        const interval = setInterval(() => {
            if (!this.peers.has(peer.nodeID!)) {
                clearInterval(interval);
                return;
            }
            try {
                (peer.socket as INodeSocket).write(TCPFrameCodec.encode(WirePacketType.PING, 'ping', new Uint8Array(0)));
            } catch (err) {
                this.logger?.warn(`Heartbeat failed for ${peer.nodeID}`);
                (peer.socket as INodeSocket).destroy();
            }
        }, 10000); // 10s heartbeat
    }

    async connectToPeer(nodeID: string, url: string): Promise<void> {
        const parsed = new URL(url);
        return new Promise((resolve, reject) => {
            const socket = net.connect(Number(parsed.port), parsed.hostname, () => {
                const peer: PeerState = {
                    socket: socket as unknown as INodeSocket,
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

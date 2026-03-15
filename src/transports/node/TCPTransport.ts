import { BaseTransport } from '../BaseTransport';
import { BaseSerializer } from '../../serializers/BaseSerializer';
import { WirePacketType, PeerState, TransportConnectOptions, ITransportSocket, ILogger, IServiceRegistry } from '../../types/mesh.types';
import { TCPFrameCodec } from '../helpers/TCPFrameCodec';
import { TCPAuthHandler } from '../helpers/TCPAuthHandler';
import { IsomorphicCrypto } from '../../utils/Crypto';
import { MeshPacket } from '../../types/packet.types';
import tls from 'node:tls';

export interface INodeSocket extends ITransportSocket {
    on(event: string, cb: (data: unknown) => void): void;
    write(data: Uint8Array): void;
    destroy(): void;
    address(): unknown;
    authorized?: boolean;
    authorizationError?: Error;
}

/**
 * TCPTransport — Node.js implementation using 'node:tls' for mTLS.
 */
export class TCPTransport extends BaseTransport {
    readonly protocol = 'tls'; // Renamed from tcp to indicate mTLS
    public server: tls.Server | null = null;
    public peers = new Map<string, PeerState>();
    private authHandler: TCPAuthHandler;
    
    public privateKey?: string;
    public registry?: IServiceRegistry;
    public logger?: ILogger;

    public tlsOptions?: tls.TlsOptions;

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
        this.privateKey = (opts as unknown as { privateKey: string }).privateKey;
        this.registry = (opts as unknown as { registry: IServiceRegistry }).registry;
        this.tlsOptions = (opts as unknown as { tls: tls.TlsOptions }).tls;

        if (!this.tlsOptions || !this.tlsOptions.key || !this.tlsOptions.cert) {
            this.logger?.warn('[TCPTransport] mTLS options missing. Falling back to insecure TLS (NOT RECOMMENDED).');
        }

        const port = opts.port || 4000;

        return new Promise((resolve, reject) => {
            const serverOptions: tls.TlsOptions = {
                ...this.tlsOptions,
                requestCert: true,
                rejectUnauthorized: true, // STRICT mTLS ENFORCEMENT
            };

            this.server = tls.createServer(serverOptions, (socket: tls.TLSSocket) => this.handleConnection(socket as unknown as INodeSocket));
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

    async send(nodeID: string, packet: MeshPacket): Promise<void> {
        const peer = this.peers.get(nodeID);
        if (!peer || !peer.isAuthenticated) throw new Error(`Target node ${nodeID} is not connected or authenticated`);
        
        const type = (packet.type === 'RESPONSE' || packet.type === 'RESPONSE_ERROR') ? WirePacketType.RPC_RES : WirePacketType.RPC_REQ;
        const payload = this.serializer.serialize(packet);
        const msgID = (packet.id as string || '0000000000000000').slice(0, 16).padEnd(16, '0');
        
        const frame = TCPFrameCodec.encode(type, msgID, payload);
        (peer.socket as INodeSocket).write(frame);
    }

    async publish(topic: string, data: unknown): Promise<void> {
        const payload = this.serializer.serialize({ topic, data, senderNodeID: this.nodeID, type: 'EVENT' });
        const msgID = '0000000000000000';
        for (const peer of this.peers.values()) {
            if (peer.isAuthenticated) {
                const frame = TCPFrameCodec.encode(WirePacketType.RPC_REQ, msgID, payload);
                (peer.socket as INodeSocket).write(frame);
            }
        }
    }

    public allowedCIDRs: string[] = [];

    private checkIPAllowed(ip: string): boolean {
        // Basic CIDR / Exact match logic.
        // In a real implementation, we would use a library like 'ipaddr.js'.
        // For now, we'll do exact match and prefix match as a placeholder.
        return this.allowedCIDRs.some(cidr => {
            if (cidr.includes('/')) {
                const [range] = cidr.split('/');
                return ip.startsWith(range); // Naive prefix match for this prototype
            }
            return cidr === ip;
        });
    }

    private handleConnection(socket: INodeSocket) {
        const remoteAddress = (socket as any).remoteAddress;
        if (this.allowedCIDRs.length > 0 && remoteAddress) {
            const isAllowed = this.checkIPAllowed(remoteAddress);
            if (!isAllowed) {
                this.logger?.warn(`[TCPTransport] Connection rejected from unauthorized IP: ${remoteAddress}`);
                socket.destroy();
                return;
            }
        }

        if (!socket.authorized) {
            this.logger?.error(`[TCPTransport] mTLS Unauthorized: ${socket.authorizationError?.message}`);
            socket.destroy();
            return;
        }

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

        socket.on('data', (chunk: unknown) => this.processData(peer, chunk as Uint8Array));
        socket.on('end', () => {
            if (peer.nodeID) {
                this.peers.delete(peer.nodeID);
                this.emit('peer:disconnect', peer.nodeID);
            }
        });
        socket.on('error', (err: unknown) => {
            if (err instanceof Error) {
                this.emit('error', err);
            }
            socket.destroy();
        });
    }

    private processData(peer: PeerState, chunk: Uint8Array) {
        // Strict edge enforcement: prevent even appending to buffer if it would exceed limits
        if (peer.bufferPot.length + chunk.length > TCPFrameCodec.MAX_FRAME_SIZE + 64) {
            this.logger?.error(`[TCPTransport] Buffer overflow threat from ${peer.nodeID || 'unknown'}. Killing connection.`);
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
        } catch (err: unknown) {
            this.logger?.error(`[TCPTransport] Framing error: ${err instanceof Error ? err.message : String(err)}`);
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
                    const packet = this.serializer.deserialize(payload) as unknown as MeshPacket;
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
                
                socket.on('data', (chunk: unknown) => this.processData(peer, chunk as Uint8Array));
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

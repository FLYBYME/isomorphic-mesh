import { BaseTransport } from './BaseTransport';
import { BaseSerializer } from '../serializers/BaseSerializer';
import { Env } from '../utils/Env';
import { ILogger, TransportConnectOptions, ITransportSocket } from '../types/mesh.types';
import { nanoid } from 'nanoid';
import { OfflineStorageEngine } from '../utils/OfflineStorageEngine';

export interface IWS extends ITransportSocket {
    on(event: string, cb: (...args: any[]) => void): void;
    terminate?(): void;
    readyState: number;
    ping?(): void;
}

export interface IWSServer {
    on(event: 'connection', cb: (ws: IWS, req: unknown) => void): void;
    close(cb?: (err?: Error) => void): void;
}

interface PendingRPC {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: NodeJS.Timeout;
}

/**
 * WSTransport — WebSocket-based transport for full-duplex communication.
 * Includes Reliability features: Correlation, Timeouts, Backoff, Replay, Heartbeats.
 */
export class WSTransport extends BaseTransport {
    readonly protocol = 'ws';

    private wss: IWSServer | null = null;
    private server: any | null = null;
    private port: number;
    private peers = new Map<string, IWS>();
    public logger?: ILogger;

    // Reliability Features
    private pendingRPCs = new Map<string, PendingRPC>();
    private static readonly RPC_TIMEOUT_MS = 10000;
    private reconnectAttempts = 0;
    private static readonly MAX_RECONNECT_ATTEMPTS = 10;
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private offlineStorage = new OfflineStorageEngine();

    constructor(serializer: BaseSerializer, port = 0) {
        super(serializer);
        this.port = port;
    }

    async connect(opts: TransportConnectOptions): Promise<void> {
        this.nodeID = opts.nodeID || this.nodeID;
        this.logger = opts.logger;

        if (Env.isBrowser()) {
            await this.offlineStorage.init();
            this.connected = true;
            this.emit('connected');
            return;
        }

        if (Env.isNode()) {
            if (opts.sharedServer) {
                return this.attachToSharedServer(opts.sharedServer);
            }
            return this.startNodeServer();
        }
    }

    private async attachToSharedServer(server: any): Promise<void> {
        const { WebSocketServer } = eval('require')('ws');
        this.server = server;
        this.wss = new WebSocketServer({ server: this.server }) as IWSServer;
        this.setupWSSHandlers();
        this.connected = true;
        this.emit('connected');
    }

    private async startNodeServer(): Promise<void> {
        const http = eval('require')('http');
        const { WebSocketServer } = eval('require')('ws');

        this.server = http.createServer();
        this.wss = new WebSocketServer({ server: this.server }) as IWSServer;
        this.setupWSSHandlers();

        return new Promise((resolve, reject) => {
            if (!this.server) return reject(new Error('Server not initialized'));
            this.server.listen(this.port, () => {
                const addr = this.server!.address();
                if (addr && typeof addr === 'object') {
                    this.port = addr.port;
                }
                this.connected = true;
                this.emit('connected');
                this.startHeartbeat();
                resolve();
            });
            this.server.on('error', reject);
        });
    }

    private setupWSSHandlers() {
        if (!this.wss) return;
        this.wss.on('connection', (ws: IWS) => {
            let peerId: string | null = null;

            ws.on('message', (raw: unknown) => {
                this.handleIncomingMessage(raw, ws, (id) => {
                    peerId = id;
                    this.peers.set(id, ws);
                });
            });

            ws.on('close', () => {
                if (peerId) {
                    this.peers.delete(peerId);
                    this.emit('peer:disconnect', peerId);
                }
            });

            ws.on('pong', () => {
                // Heartbeat received
            });
        });
    }

    private handleIncomingMessage(raw: unknown, socket: IWS, onIdentify?: (id: string) => void) {
        try {
            const payloadString = this.decodePayload(raw);
            const envelope = this.serializer.deserialize(payloadString) as any;
            const { topic, data, senderId, id, type } = envelope;

            if (senderId && onIdentify) {
                onIdentify(senderId);
            }

            // Correlation Logic
            if (type === 'RESPONSE' || type === 'RESPONSE_ERROR') {
                const pending = this.pendingRPCs.get(id);
                if (pending) {
                    clearTimeout(pending.timeout);
                    this.pendingRPCs.delete(id);
                    if (type === 'RESPONSE_ERROR') {
                        pending.reject(new Error(data.message || 'RPC Error'));
                    } else {
                        pending.resolve(data);
                    }
                }
                return;
            }

            const handlers = this.subscriptions.get(topic) || [];
            for (const handler of handlers) {
                handler(data);
            }
            this.emit('packet', envelope);
        } catch (err: unknown) {
            this.emit('error', err instanceof Error ? err : new Error(String(err)));
        }
    }

    private decodePayload(raw: unknown): string {
        if (typeof raw === 'string') return raw;
        if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) return raw.toString('utf-8');
        if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) return new TextDecoder().decode(raw);
        return String(raw);
    }

    async disconnect(): Promise<void> {
        this.stopHeartbeat();
        for (const ws of this.peers.values()) {
            ws.close();
        }
        this.peers.clear();

        if (this.wss) {
            this.wss.close();
        }
        if (this.server && !this.server._isShared) { 
            await new Promise<void>(resolve => this.server!.close(() => resolve()));
        }
        this.connected = false;
        this.emit('disconnected');
    }

    async send(nodeID: string, packet: Record<string, unknown>): Promise<void> {
        const ws = this.peers.get(nodeID);
        if (!ws || ws.readyState !== 1) {
            // If in browser and disconnected, queue for later
            if (Env.isBrowser() && packet.type === 'CALL') {
                await this.offlineStorage.queue({
                    id: (packet.id as string) || nanoid(),
                    targetId: nodeID,
                    topic: packet.topic as string,
                    data: packet.data,
                    timestamp: Date.now()
                });
                return;
            }
            throw new Error(`Connection to node ${nodeID} is not open`);
        }

        const correlationId = (packet.id as string) || nanoid();
        const buf = this.serializer.serialize({ ...packet, senderId: this.nodeID, id: correlationId });
        ws.send(new TextDecoder().decode(buf));
    }

    async call(nodeID: string, topic: string, data: Record<string, unknown>): Promise<any> {
        const id = nanoid();
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (this.pendingRPCs.has(id)) {
                    this.pendingRPCs.delete(id);
                    reject(new Error(`RPC timeout after ${WSTransport.RPC_TIMEOUT_MS}ms`));
                }
            }, WSTransport.RPC_TIMEOUT_MS);

            this.pendingRPCs.set(id, { resolve, reject, timeout });

            this.send(nodeID, { topic, data, id, type: 'CALL' }).catch(err => {
                clearTimeout(timeout);
                this.pendingRPCs.delete(id);
                reject(err);
            });
        });
    }

    async publish(topic: string, data: Record<string, unknown>): Promise<void> {
        const buf = this.serializer.serialize({ topic, data, senderId: this.nodeID, type: 'EVENT' });
        const payload = new TextDecoder().decode(buf);
        for (const ws of this.peers.values()) {
            if (ws.readyState === 1) {
                ws.send(payload);
            }
        }
    }

    async connectToPeer(nodeID: string, url: string): Promise<void> {
        return this.internalConnectToPeer(nodeID, url);
    }

    private async internalConnectToPeer(nodeID: string, url: string, attempt = 0): Promise<void> {
        return new Promise((resolve, reject) => {
            const isNode = Env.isNode();
            const WS = isNode ? eval('require')('ws') : (window as any).WebSocket;
            const ws = new WS(url) as IWS;

            ws.on('open', () => {
                this.reconnectAttempts = 0;
                this.peers.set(nodeID, ws);
                this.emit('peer:connect', nodeID);
                this.replayQueuedRPCs(nodeID);
                resolve();
            });

            ws.on('error', (err: unknown) => {
                if (attempt === 0) reject(err);
            });

            ws.on('message', (data: unknown) => {
                this.handleIncomingMessage(data, ws);
            });

            ws.on('close', () => {
                this.peers.delete(nodeID);
                this.emit('peer:disconnect', nodeID);
                this.handleReconnection(nodeID, url);
            });
        });
    }

    private async replayQueuedRPCs(nodeID: string) {
        if (!Env.isBrowser()) return;
        const queued = await this.offlineStorage.getAll();
        for (const rpc of queued) {
            if (rpc.targetId === nodeID) {
                this.send(nodeID, {
                    id: rpc.id,
                    topic: rpc.topic,
                    data: rpc.data,
                    type: 'CALL'
                }).then(() => {
                    this.offlineStorage.remove(rpc.id);
                }).catch(() => { });
            }
        }
    }

    private handleReconnection(nodeID: string, url: string) {
        if (this.reconnectAttempts >= WSTransport.MAX_RECONNECT_ATTEMPTS) {
            this.logger?.error(`Max reconnection attempts reached for node ${nodeID}`);
            return;
        }

        const delay = Math.min(30000, Math.pow(2, this.reconnectAttempts) * 1000);
        this.reconnectAttempts++;

        setTimeout(() => {
            this.internalConnectToPeer(nodeID, url, this.reconnectAttempts).catch(() => { });
        }, delay);
    }

    private startHeartbeat(): void {
        this.heartbeatTimer = setInterval(() => {
            for (const ws of this.peers.values()) {
                if (ws.readyState === 1 && ws.ping) {
                    ws.ping();
                }
            }
        }, 30000);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
}

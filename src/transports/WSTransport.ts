import { BaseTransport } from './BaseTransport';
import { BaseSerializer } from '../serializers/BaseSerializer';
import { Env } from '../utils/Env';
import { ILogger, TransportConnectOptions, ITransportSocket } from '../types/mesh.types';

export interface IWS extends ITransportSocket {
    on(event: 'message', cb: (data: unknown) => void): void;
    on(event: 'close', cb: () => void): void;
    on(event: 'error', cb: (err: Error) => void): void;
    terminate?(): void;
    readyState: number;
}

export interface IWSServer {
    on(event: 'connection', cb: (ws: IWS, req: unknown) => void): void;
    close(cb?: (err?: Error) => void): void;
}

/**
 * WSTransport — WebSocket-based transport for full-duplex communication.
 */
export class WSTransport extends BaseTransport {
    readonly protocol = 'ws';

    private wss: IWSServer | null = null;
    private server: { listen(port: number, cb: () => void): void; close(cb: () => void): void; address(): any; on(ev: string, cb: any): void } | null = null;
    private port: number;
    private peers = new Map<string, IWS>();
    public logger?: ILogger;

    constructor(serializer: BaseSerializer, port = 0) {
        super(serializer);
        this.port = port;
    }

    async connect(opts: TransportConnectOptions): Promise<void> {
        this.nodeID = opts.nodeID || this.nodeID;
        this.logger = opts.logger;

        if (Env.isBrowser()) {
            this.connected = true;
            this.emit('connected');
            return;
        }

        if (Env.isNode()) {
            return this.startNodeServer();
        }
    }

    private async startNodeServer(): Promise<void> {
        const http = eval('require')('http');
        const { WebSocketServer } = eval('require')('ws');

        this.server = http.createServer();
        this.wss = new WebSocketServer({ server: this.server }) as IWSServer;

        this.wss.on('connection', (ws: IWS) => {
            let peerId: string | null = null;

            ws.on('message', (raw: unknown) => {
                try {
                    const payloadString = this.decodePayload(raw);
                    const envelope = this.serializer.deserialize(payloadString) as { topic: string, data: Record<string, unknown>, senderId?: string };
                    const { topic, data, senderId } = envelope;

                    if (senderId) {
                        peerId = senderId;
                        this.peers.set(senderId, ws);
                    }

                    const handlers = this.subscriptions.get(topic) || [];
                    for (const handler of handlers) {
                        handler(data);
                    }
                    this.emit('packet', envelope);
                } catch (err: unknown) {
                    this.emit('error', err instanceof Error ? err : new Error(String(err)));
                }
            });

            ws.on('close', () => {
                if (peerId) {
                    this.peers.delete(peerId);
                    this.emit('peer:disconnect', peerId);
                }
            });
        });

        return new Promise((resolve, reject) => {
            if (!this.server) return reject(new Error('Server not initialized'));
            this.server.listen(this.port, () => {
                const addr = this.server!.address();
                if (addr && typeof addr === 'object') {
                    this.port = addr.port;
                }
                this.connected = true;
                this.emit('connected');
                resolve();
            });
            this.server.on('error', reject);
        });
    }

    private decodePayload(raw: unknown): string {
        if (typeof raw === 'string') return raw;
        if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) return raw.toString('utf-8');
        if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) return new TextDecoder().decode(raw);
        return String(raw);
    }

    async disconnect(): Promise<void> {
        for (const ws of this.peers.values()) {
            ws.close();
        }
        this.peers.clear();

        if (this.wss) {
            this.wss.close();
        }
        if (this.server) {
            await new Promise<void>(resolve => this.server!.close(() => resolve()));
        }
        this.connected = false;
        this.emit('disconnected');
    }

    async send(nodeID: string, packet: Record<string, unknown>): Promise<void> {
        const ws = this.peers.get(nodeID);
        if (ws && ws.readyState === 1) {
            const buf = this.serializer.serialize({ ...packet, senderId: this.nodeID });
            ws.send(new TextDecoder().decode(buf));
        }
    }

    async publish(topic: string, data: Record<string, unknown>): Promise<void> {
        const buf = this.serializer.serialize({ topic, data, senderId: this.nodeID });
        const payload = new TextDecoder().decode(buf);
        for (const ws of this.peers.values()) {
            if (ws.readyState === 1) {
                ws.send(payload);
            }
        }
    }

    async connectToPeer(nodeID: string, url: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const isNode = Env.isNode();
            const WS = isNode ? eval('require')('ws') : (window as any).WebSocket;
            const ws = new WS(url) as IWS & { onopen?: () => void, onerror?: (e: any) => void, onmessage?: (e: any) => void };

            const onOpen = () => {
                this.peers.set(nodeID, ws);
                resolve();
            };

            const onError = (err: unknown) => {
                reject(err instanceof Error ? err : new Error(String(err)));
            };

            if (isNode) {
                ws.on('open' as any, onOpen);
                ws.on('error', onError);
                ws.on('message', (data: unknown) => {
                    const payloadString = this.decodePayload(data);
                    const envelope = this.serializer.deserialize(payloadString);
                    this.emit('packet', envelope);
                });
            } else {
                ws.onopen = onOpen;
                ws.onerror = onError;
                ws.onmessage = (event: any) => {
                    const payloadString = this.decodePayload(event.data);
                    const envelope = this.serializer.deserialize(payloadString);
                    this.emit('packet', envelope);
                };
            }
        });
    }
}

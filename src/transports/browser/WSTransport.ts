import { BaseTransport } from '../BaseTransport';
import { BaseSerializer } from '../../serializers/BaseSerializer';
import { ILogger, TransportConnectOptions, ITransportSocket } from '../../types/mesh.types';
import { nanoid } from 'nanoid';
import { OfflineStorageEngine } from '../../utils/OfflineStorageEngine';
import { MeshPacket } from '../../types/packet.types';

export interface IWS extends ITransportSocket {
    readyState: number;
}

interface PendingRPC {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: any;
}

/**
 * WSTransport — Browser implementation using native WebSocket.
 */
export class WSTransport extends BaseTransport {
    readonly protocol = 'ws';

    private ws: WebSocket | null = null;
    private peers = new Map<string, WebSocket>();
    public logger?: ILogger;

    private pendingRPCs = new Map<string, PendingRPC>();
    private static readonly RPC_TIMEOUT_MS = 10000;
    private reconnectAttempts = 0;
    private static readonly MAX_RECONNECT_ATTEMPTS = 10;
    private offlineStorage = new OfflineStorageEngine();

    constructor(serializer: BaseSerializer, _port = 0) {
        super(serializer);
    }

    async connect(opts: TransportConnectOptions): Promise<void> {
        this.nodeID = opts.nodeID || this.nodeID;
        this.logger = opts.logger;

        await this.offlineStorage.init();
        this.connected = true;
        this.emit('connected');
    }

    async disconnect(): Promise<void> {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        for (const ws of this.peers.values()) {
            ws.close();
        }
        this.peers.clear();
        this.connected = false;
        this.emit('disconnected');
    }

    async send(nodeID: string, packet: MeshPacket): Promise<void> {
        const ws = this.peers.get(nodeID) || this.ws;
        
        if (!ws || ws.readyState !== 1) {
            if (packet.type === 'REQUEST') {
                await this.offlineStorage.queue({
                    id: (packet.id as string) || nanoid(),
                    targetId: nodeID,
                    topic: packet.topic as string,
                    data: packet.data as any,
                    timestamp: Date.now()
                });
                return;
            }
            throw new Error(`Connection to node ${nodeID} is not open`);
        }

        const correlationId = (packet.id as string) || nanoid();
        const buf = this.serializer.serialize({ ...packet, senderNodeID: this.nodeID, id: correlationId });
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

            this.send(nodeID, { topic, data, id, type: 'REQUEST', senderNodeID: this.nodeID, timestamp: Date.now() }).catch(err => {
                clearTimeout(timeout);
                this.pendingRPCs.delete(id);
                reject(err);
            });
        });
    }

    async publish(topic: string, packet: MeshPacket): Promise<void> {
        const buf = this.serializer.serialize(packet);
        const payload = new TextDecoder().decode(buf);
        if (this.ws && this.ws.readyState === 1) {
            this.ws.send(payload);
        }
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
            const ws = new WebSocket(url);

            ws.onopen = () => {
                this.reconnectAttempts = 0;
                this.peers.set(nodeID, ws);
                this.emit('peer:connect', nodeID);
                this.replayQueuedRPCs(nodeID);
                resolve();
            };

            ws.onerror = (err: any) => {
                if (attempt === 0) reject(err);
            };

            ws.onmessage = (event: MessageEvent) => {
                this.handleIncomingMessage(event.data, ws);
            };

            ws.onclose = () => {
                this.peers.delete(nodeID);
                this.emit('peer:disconnect', nodeID);
                this.handleReconnection(nodeID, url);
            };
        });
    }

    private handleIncomingMessage(raw: any, _socket: WebSocket) {
        try {
            const envelope = this.serializer.deserialize(raw) as MeshPacket;
            const { topic, data, id, type, senderNodeID } = envelope as any;

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

    private async replayQueuedRPCs(nodeID: string) {
        const queued = await this.offlineStorage.getAll();
        for (const rpc of queued) {
            if (rpc.targetId === nodeID) {
                this.send(nodeID, {
                    id: rpc.id,
                    topic: rpc.topic,
                    data: rpc.data,
                    type: 'REQUEST',
                    senderNodeID: this.nodeID,
                    timestamp: rpc.timestamp
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
}

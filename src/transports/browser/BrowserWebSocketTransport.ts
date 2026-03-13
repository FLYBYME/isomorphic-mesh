import { ITransport } from '../../interfaces/ITransport';
import { IMeshPacket, MeshPacketSchema } from '../../contracts/packet.schema';

/**
 * BrowserWebSocketTransport — Strict WebSocket transport for the browser.
 */
export class BrowserWebSocketTransport implements ITransport {
    private ws: WebSocket | null = null;
    private messageHandler: ((p: IMeshPacket) => void) | null = null;
    private errorHandler: ((e: Error) => void) | null = null;
    private reconnectAttempts = 0;
    private readonly MAX_DELAY = 30000;
    private isManuallyClosed = false;

    constructor(private url: string) {}

    async connect(): Promise<void> {
        this.isManuallyClosed = false;
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url);
                
                this.ws.onopen = () => {
                    this.reconnectAttempts = 0;
                    console.log(`[WS] Connected to ${this.url}`);
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const raw = JSON.parse(event.data);
                        // Task 3 Upgrade: Zod Firewall
                        const packet = MeshPacketSchema.parse(raw);
                        this.messageHandler?.(packet);
                    } catch (err) {
                        this.errorHandler?.(new Error(`[WS] Invalid Packet Dropped: ${err}`));
                    }
                };

                this.ws.onerror = (err) => {
                    this.errorHandler?.(new Error(`[WS] Connection Error`));
                    // Check readyState to decide if we should reject the initial connect
                    if (this.ws?.readyState !== WebSocket.OPEN) {
                        reject(err);
                    }
                };

                this.ws.onclose = () => {
                    if (!this.isManuallyClosed) {
                        this.handleReconnect();
                    }
                };
                
            } catch (err) {
                reject(err);
            }
        });
    }

    private handleReconnect() {
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.MAX_DELAY);
        this.reconnectAttempts++;
        
        console.warn(`[WS] Connection lost. Reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts})`);
        setTimeout(() => {
            if (!this.isManuallyClosed) {
                this.connect().catch(() => {
                    // Reconnect failed, handled by next onclose or explicit retry
                });
            }
        }, delay);
    }

    async disconnect(): Promise<void> {
        this.isManuallyClosed = true;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    async send(packet: IMeshPacket): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('[WS] Cannot send: Transport not connected');
        }
        this.ws.send(JSON.stringify(packet));
    }

    onMessage(handler: (packet: IMeshPacket) => void): void {
        this.messageHandler = handler;
    }

    onError(handler: (error: Error) => void): void {
        this.errorHandler = handler;
    }
}

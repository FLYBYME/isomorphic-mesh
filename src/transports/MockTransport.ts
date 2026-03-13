import { BaseTransport } from './BaseTransport';
import { BaseSerializer } from '../serializers/BaseSerializer';
import { TransportConnectOptions } from '../types/mesh.types';

export interface MockTransportConfig {
    latency?: number; // ms
    jitter?: number;  // 0-1
    reliability?: number; // 0-1 (1 = 100% reliable)
}

/**
 * MockTransport — A testing transport that simulates network conditions.
 */
export class MockTransport extends BaseTransport {
    public readonly protocol = 'mock';
    private mockConfig: MockTransportConfig;

    constructor(serializer: BaseSerializer, config: MockTransportConfig = {}) {
        super(serializer);
        this.mockConfig = config;
    }

    async connect(opts: TransportConnectOptions): Promise<void> {
        this.nodeID = opts.nodeID;
        this.connected = true;
        this.emit('connected');
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        this.emit('disconnected');
    }

    async send(nodeID: string, packet: Record<string, unknown>): Promise<void> {
        // Simulate reliability
        const reliability = this.mockConfig.reliability ?? 1;
        if (Math.random() > reliability) {
            return;
        }

        // Simulate latency
        const latency = this.mockConfig.latency ?? 10;
        const delay = latency + (Math.random() * (this.mockConfig.jitter ? this.mockConfig.jitter * 100 : 20));
        
        setTimeout(() => {
            this.emit('message', { nodeID, packet });
        }, delay);
    }

    async publish(topic: string, data: Record<string, unknown>): Promise<void> {
        await this.send('all', data);
    }
}

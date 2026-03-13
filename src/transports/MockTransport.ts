import { BaseTransport } from './BaseTransport';
import { WirePacket, TransportConfig } from '../types/mesh.types';

export interface MockTransportConfig extends TransportConfig {
    latency?: number; // ms
    jitter?: number;  // 0-1
    reliability?: number; // 0-1 (1 = 100% reliable)
}

/**
 * MockTransport — A testing transport that simulates network conditions.
 */
export class MockTransport extends BaseTransport {
    private reliability: number;
    private latency: number;

    constructor(config: MockTransportConfig = {}) {
        super(config);
        this.reliability = config.reliability ?? 1;
        this.latency = config.latency ?? 10;
    }

    async connect(): Promise<void> {
        this.emit('connected');
    }

    async disconnect(): Promise<void> {
        this.emit('disconnected');
    }

    async send(packet: WirePacket): Promise<void> {
        // Simulate reliability
        if (Math.random() > this.reliability) {
            console.warn(`[MockTransport] Packet dropped: ${packet.type}`);
            return;
        }

        // Simulate latency
        const delay = this.latency + (Math.random() * 20); // Add a bit of jitter
        
        setTimeout(() => {
            // Echo back or handle internal routing logic
            // In a real mock, we might have a static registry of "nodes"
            this.emit('message', packet);
        }, delay);
    }

    async publish(topic: string, packet: WirePacket): Promise<void> {
        await this.send(packet);
    }
}

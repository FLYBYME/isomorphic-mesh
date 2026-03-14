import { IInterceptor } from 'isomorphic-core';
import { MeshPacket } from '../types/packet.types';

/**
 * LogInterceptor — simple example interceptor for observability.
 */
export const LogInterceptor: IInterceptor<MeshPacket, MeshPacket> = {
    name: 'log-interceptor',
    onOutbound: async (packet: MeshPacket) => {
        console.log(`[OUTBOUND] Topic: ${packet.topic}, ID: ${packet.id}`);
        return packet;
    },
    onInbound: async (packet: MeshPacket) => {
        console.log(`[INBOUND] Topic: ${packet.topic}, ID: ${packet.id}`);
        return packet;
    }
};

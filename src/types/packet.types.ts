export type PacketType = 'REQUEST' | 'RESPONSE' | 'RESPONSE_ERROR' | 'EVENT' | 'AUTH' | 'PING';

export interface BasePacket {
    id: string;
    topic: string;
    type: PacketType;
    senderNodeID: string;
    timestamp: number;
    version?: number;
    priority?: number;
    meta?: Record<string, unknown>;
}

export interface RPCRequest extends BasePacket {
    type: 'REQUEST';
    data: unknown;
}

export interface RPCResponse extends BasePacket {
    type: 'RESPONSE';
    data: unknown;
}

export interface RPCErrorResponse extends BasePacket {
    type: 'RESPONSE_ERROR';
    error: {
        message: string;
        code?: number | string;
        data?: unknown;
    };
    data?: never; // Ensure data is not used in errors
}

export interface EventPacket extends BasePacket {
    type: 'EVENT';
    data: unknown;
}

export type MeshPacket = RPCRequest | RPCResponse | RPCErrorResponse | EventPacket;

/**
 * Utility to check if a packet is of a certain type.
 */
export function isRPCRequest(packet: MeshPacket): packet is RPCRequest {
    return packet.type === 'REQUEST';
}

export function isRPCResponse(packet: MeshPacket): packet is RPCResponse {
    return packet.type === 'RESPONSE';
}

export function isRPCErrorResponse(packet: MeshPacket): packet is RPCErrorResponse {
    return packet.type === 'RESPONSE_ERROR';
}

export function isEventPacket(packet: MeshPacket): packet is EventPacket {
    return packet.type === 'EVENT';
}

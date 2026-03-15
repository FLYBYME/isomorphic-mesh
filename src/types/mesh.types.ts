import { IServiceRegistry, IMeshNode, ILogger as ICoreLogger } from 'isomorphic-core';

export { IServiceRegistry, IMeshNode };

export interface ILogger extends ICoreLogger {
    trace?(msg: string, data?: Record<string, unknown>): void;
}

export interface ActionInfo {
    name?: string;
    visibility?: 'public' | 'user' | 'internal' | 'published' | 'protected' | 'private';
    params?: Record<string, unknown>;
    rest?: Record<string, unknown>;
    roles?: string[];
    matchAny?: boolean;
}

export interface EventInfo {
    name?: string;
    group?: string;
}

export interface ServiceInfo {
    name: string;
    fullName?: string;
    version?: string | number;
    settingsSchema?: Record<string, unknown>;
    dependencies?: string[];
    actions?: Record<string, ActionInfo>;
    events?: Record<string, EventInfo>;
    metadata?: Record<string, unknown>;
    rest?: Record<string, unknown>;
}

export interface NodeInfo {
    nodeID: string;
    hostname?: string;
    type: string;
    nodeType?: string;
    namespace: string;
    addresses: string[];
    trustLevel?: 'internal' | 'user' | 'public';
    available?: boolean;
    timestamp?: number;
    capabilities?: Record<string, unknown>;
    resources?: unknown;
    nodeSeq?: number;
    services: ServiceInfo[];
    pid?: number;
    parentID?: string;
    hidden?: boolean;
    metadata?: Record<string, unknown>;
    cpu?: number;
    activeRequests?: number;
    healthScore?: number;
    lastHeartbeatTime?: number;
    publicKey?: string; // Ed25519 Public Key
}

export interface IPacket<T = Record<string, unknown>> {
    id: string;
    topic: string;
    type: 'event' | 'request' | 'response' | 'error';
    payload: T;
    senderNodeID: string;
    timestamp: number;
    meta?: Record<string, unknown>;
}

export enum WirePacketType {
    AUTH = 0x01,
    RPC_REQ = 0x02,
    RPC_RES = 0x03,
    PIECE_DATA = 0x04,
    PING = 0x05,
}

export interface ITransportSocket {
    send(data: Uint8Array | string): void;
    close(): void;
    readonly readyState: number;
}

export interface PeerState {
    socket: ITransportSocket;
    nodeID: string | null;
    isAuthenticated: boolean;
    isChoked: boolean;
    bufferPot: Uint8Array;
    bufferList: Uint8Array[];
    bufferPotSize: number;
}

export type TransportType = 'ws' | 'http' | 'tcp' | 'ipc' | 'nats' | 'mock';
export type SerializerType = 'json' | 'binary' | 'protobuf';

export interface TransportConnectOptions {
    url: string;
    nodeID: string;
    namespace: string;
    authToken?: string;
    sharedServer?: unknown; // http.Server
    sharedApp?: unknown;    // express.Application
    host?: string;
    port?: number;
    logger?: ILogger;
}

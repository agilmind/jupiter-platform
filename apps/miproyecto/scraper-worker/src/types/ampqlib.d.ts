declare module 'amqplib' {
  export interface Connection {
    createChannel(): Promise<Channel>;
    close(): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): Connection;
    serverProperties: any;
    expectSocketClose: boolean;
    sentSinceLastCheck: number;
    recvSinceLastCheck: number;
    sendMessage: Function;
  }

  export interface Channel {
    assertQueue(queue: string, options?: any): Promise<any>;
    bindQueue(
      queue: string,
      exchange: string,
      pattern: string,
      args?: any
    ): Promise<any>;
    prefetch(count: number): void;
    consume(
      queue: string,
      onMessage: (msg: any) => void,
      options?: any
    ): Promise<any>;
    sendToQueue(queue: string, content: Buffer, options?: any): boolean;
    ack(message: any, allUpTo?: boolean): void;
    nack(message: any, allUpTo?: boolean, requeue?: boolean): void;
    close(): Promise<void>;
    assertExchange(exchange: string, type: string, options?: any): Promise<any>;
    publish(
      exchange: string,
      routingKey: string,
      content: Buffer,
      options?: any
    ): boolean;
  }

  export interface Message {
    content: Buffer;
    fields: any;
    properties: any;
  }

  export interface Options {
    protocol?: string;
    hostname?: string;
    port?: number;
    username?: string;
    password?: string;
    locale?: string;
    frameMax?: number;
    heartbeat?: number;
    vhost?: string;
  }

  export function connect(url: string | Options): Promise<Connection>;
}

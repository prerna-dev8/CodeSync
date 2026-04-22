declare module 'y-websocket' {
  import * as Y from 'yjs';
  export class WebsocketProvider {
    constructor(url: string, name: string, doc: Y.Doc, options?: any);
    doc: Y.Doc;
    destroy(): void;
  }
}

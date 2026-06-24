declare module 'graphology' {
  export default class Graph {
    constructor();
    addNode(node: string, attributes?: any): string;
    addEdge(source: string, target: string, attributes?: any): string;
    hasNode(node: string): boolean;
    getNodeAttributes(node: string): any;
    forEachNode(callback: (node: string, attributes: any) => void): void;
    forEachOutboundEdge(node: string, callback: (edge: string, attributes: any, source: string, target: string) => void): void;
    forEachInboundEdge(node: string, callback: (edge: string, attributes: any, source: string, target: string) => void): void;
    export(): any;
    import(data: any): void;
  }
}

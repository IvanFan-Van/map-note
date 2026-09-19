import "leaflet";

declare module "leaflet" {
  interface PolylineDecoratorPattern {
    offset?: string | number;
    endOffset?: string | number;
    repeat?: string | number;
    symbol: unknown;
  }
  interface PolylineDecoratorOptions {
    patterns: PolylineDecoratorPattern[];
  }
  /** @see https://github.com/bbecquet/Leaflet.PolylineDecorator */
  function polylineDecorator(
    polyline: Polyline,
    options: PolylineDecoratorOptions,
  ): Layer;

  /** leaflet-polylinedecorator 附加在 L.Symbol 上的符号构造器 */
  namespace Symbol {
    function arrowHead(options: {
      pixelSize?: number;
      polygon?: boolean;
      pathOptions?: PathOptions;
    }): unknown;
  }
}

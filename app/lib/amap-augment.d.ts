/// <reference types="@amap/amap-jsapi-types" />

/** 高德 JS API 2.0 中官方类型未覆盖的部分 */

interface Window {
  _AMapSecurityConfig?: {
    securityJsCode?: string;
    serviceHost?: string;
  };
}

declare namespace AMap {
  interface ToolBarOptions {
    position?:
      | string
      | { top?: string; right?: string; bottom?: string; left?: string };
    offset?: Pixel;
    ruler?: boolean;
    liteStyle?: boolean;
    direction?: boolean;
  }

  class ToolBar {
    constructor(options?: ToolBarOptions);
  }

  interface InfoWindow {
    on(event: "open" | "close", handler: () => void): void;
    off(event: "open" | "close", handler?: () => void): void;
  }

  /** 点聚合数据项: extData 由业务方挂载 (文档未列出但官方示例使用) */
  interface ClusterPointData {
    lnglat: [number, number];
    weight?: number;
    extData?: unknown;
  }

  interface MarkerClusterOptions {
    gridSize?: number;
    maxZoom?: number;
    averageCenter?: boolean;
    renderClusterMarker?: (context: { count: number; marker: Marker }) => void;
    renderMarker?: (context: { marker: Marker }) => void;
  }

  /** clusterclick 事件载荷, 不同版本字段有差异, 统一按可选处理 */
  interface ClusterClickEvent {
    cluster?: Marker;
    lnglat?: LngLat;
    marker?: Marker[];
    clusterData?: ClusterPointData[];
  }

  class MarkerCluster {
    constructor(
      map: Map,
      data: ClusterPointData[],
      options?: MarkerClusterOptions,
    );
    setData(data: ClusterPointData[]): void;
    setMap(map: Map | null): void;
    getMap(): Map | null;
    on(event: "click", handler: (event: ClusterClickEvent) => void): void;
    off(event: "click", handler?: (event: ClusterClickEvent) => void): void;
  }
}

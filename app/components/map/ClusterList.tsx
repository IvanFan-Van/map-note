import type { PlaceSummary } from "~/lib/types";

/** 标记组悬浮列表: 单击标记组时展示组内具体标记 */
export function ClusterList({
  places,
  onPick,
}: {
  places: PlaceSummary[];
  onPick: (place: PlaceSummary) => void;
}) {
  return (
    <div className="cluster-list">
      <header className="cluster-header">
        <h3>该区域共 {places.length} 个地点</h3>
        <p className="cluster-hint">点击任意地点跳转过去</p>
      </header>
      <ul>
        {places.map((p, i) => (
          <li key={p.id}>
            <button className="candidate-item" onClick={() => onPick(p)}>
              <span className="candidate-name">{i + 1}. {p.name}</span>
              <span className="candidate-addr">{p.address || (p.lat.toFixed(4) + ", " + p.lng.toFixed(4))}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

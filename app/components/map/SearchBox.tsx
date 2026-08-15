import { useEffect, useRef, useState } from "react";
import { searchGeocode } from "~/lib/geocode";
import type { GeocodeResult } from "~/lib/types";
import type { DraftPoint } from "./AddPlaceModal";

/** 地址搜索框: 输入关键词 → 候选列表 → 选择后交给添加流程 */
export function SearchBox({ onPick }: { onPick: (draft: DraftPoint) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (query.length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      setBusy(true);
      void searchGeocode(query, undefined, 6)
        .then((r) => {
          setResults(r);
          setOpen(true);
        })
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 400);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [q]);

  const pick = (r: GeocodeResult) => {
    onPick({
      lat: r.lat,
      lng: r.lng,
      name: r.name || r.displayName.slice(0, 40),
      address: r.displayName,
    });
    setQ("");
    setResults(null);
    setOpen(false);
  };

  return (
    <div className="search-box">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && results && results.length > 0) pick(results[0]);
        }}
        placeholder="搜索地点/地址…"
        className="search-input"
      />
      {busy && <span className="search-spinner" />}
      {open && results && (
        <ul className="search-results">
          {results.length === 0 ? (
            <li className="search-empty">未找到匹配地点</li>
          ) : (
            results.map((r, i) => (
              <li key={i}>
                <button className="candidate-item" onMouseDown={(e) => { e.preventDefault(); pick(r); }}>
                  <span className="candidate-name">{r.name || "未知地点"}</span>
                  <span className="candidate-addr">{r.displayName}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

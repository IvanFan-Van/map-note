// 便笺元属性定义 (Obsidian 式 properties)
// - 动态添加: 只有用户显式添加的属性才保存/显示
// - select 存选项 value (稳定 id), 显示时映射回 label
// - 自定义属性 (不在预设中) 存原始文本

export interface MetaAttr {
  key: string;
  label: string;
  icon: string;
  type: "select" | "number" | "text";
  options?: { value: string; label: string }[];
  placeholder?: string;
  max?: number;
}

export const META_ATTRS: MetaAttr[] = [
  {
    key: "mood",
    label: "心情",
    icon: "😊",
    type: "select",
    options: [
      { value: "happy", label: "😊 开心" },
      { value: "neutral", label: "😐 一般" },
      { value: "sad", label: "😔 低落" },
      { value: "angry", label: "😡 生气" },
      { value: "sleepy", label: "😴 困倦" },
    ],
  },
  {
    key: "weather",
    label: "天气",
    icon: "☀️",
    type: "select",
    options: [
      { value: "sunny", label: "☀️ 晴" },
      { value: "cloudy", label: "🌤 多云" },
      { value: "rainy", label: "🌧 雨" },
      { value: "snowy", label: "🌨 雪" },
      { value: "stormy", label: "⛈ 雷暴" },
    ],
  },
  {
    key: "fatigue",
    label: "疲惫",
    icon: "⚡",
    type: "number",
    max: 10,
  },
  {
    key: "diet",
    label: "进食",
    icon: "🍽",
    type: "text",
    placeholder: "今天吃了什么…",
  },
];

export function metaAttrOf(key: string): MetaAttr | undefined {
  return META_ATTRS.find((a) => a.key === key);
}

export function metaIconOf(key: string): string {
  return metaAttrOf(key)?.icon ?? "🏷";
}

// 显示文本: select 映射 label; number 渲染 "n/10"; 未知/自定义属性回退原值
export function metaDisplay(key: string, value: string): string {
  const attr = metaAttrOf(key);
  if (attr?.type === "select") {
    return attr.options?.find((o) => o.value === value)?.label ?? value;
  }
  if (attr?.type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? `${n}/${attr.max ?? 10}` : value;
  }
  return value;
}

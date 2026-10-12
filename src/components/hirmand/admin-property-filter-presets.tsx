import { useEffect, useState } from "react";
import { Bookmark, Save, Trash2 } from "lucide-react";

type State = {
  query: string;
  listFilter: string;
  listTransaction: string;
  listType: string;
  listNeighborhood: string;
  listSort: string;
  listMedia: string;
  listPriceMin: string;
  listPriceMax: string;
  listAreaMin: string;
  listBedroomsMin: string;
};

const STORAGE_KEY = "hirmand.admin.property.filter-presets.v1";

type Preset = State & { name: string };

export function AdminPropertyFilterPresets(props: {
  state: State;
  onApply: (state: State) => void;
}) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) as unknown : [];
      if (Array.isArray(parsed)) setPresets(parsed.filter((item): item is Preset => Boolean(item && typeof item === "object" && typeof (item as Record<string, unknown>).name === "string")).slice(0, 20));
    } catch {
      setPresets([]);
    }
  }, []);

  function persist(next: Preset[]) {
    setPresets(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (error) { void error; }
  }

  function save() {
    const name = window.prompt("نام این فیلتر را وارد کنید:");
    if (!name?.trim()) return;
    const preset: Preset = { ...props.state, name: name.trim().slice(0, 60) };
    persist([preset, ...presets.filter((item) => item.name !== preset.name)].slice(0, 20));
    setSelected(preset.name);
  }

  function remove() {
    if (!selected) return;
    persist(presets.filter((item) => item.name !== selected));
    setSelected("");
  }

  function apply() {
    const preset = presets.find((item) => item.name === selected);
    if (preset) {
      const { name: _name, ...state } = preset;
      void _name;
      props.onApply(state);
    }
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <select className="admin-lead-status-select" value={selected} onChange={(event) => setSelected(event.target.value)} aria-label="فیلترهای ذخیره‌شده">
        <option value="">فیلترهای ذخیره‌شده</option>
        {presets.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
      </select>
      <button type="button" className="btn-ghost" onClick={apply} disabled={!selected}><Bookmark size={14}/> اعمال</button>
      <button type="button" className="btn-ghost" onClick={save}><Save size={14}/> ذخیره فیلتر</button>
      <button type="button" className="btn-ghost" onClick={remove} disabled={!selected} aria-label="حذف فیلتر ذخیره‌شده"><Trash2 size={14}/></button>
    </div>
  );
}

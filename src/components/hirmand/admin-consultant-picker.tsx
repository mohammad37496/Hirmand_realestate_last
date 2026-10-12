import { useEffect, useState } from "react";
import { Check, Handshake, Briefcase } from "lucide-react";
import { listConsultants, type Consultant } from "@/lib/consultants";
import { TEAM } from "@/lib/site";

type Props = {
  contactName: string;
  contactPhone: string;
  onSelect: (member: Consultant) => void;
};

function normalizePhone(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[\s\-()]/g, "")
    .replace(/^(?:\+98|0098|98)/, "0");
}

export function AdminConsultantPicker({ contactName, contactPhone, onSelect }: Props) {
  const phoneNorm = normalizePhone(contactPhone || "");
  const nameTrim = (contactName || "").trim();
  const [consultants, setConsultants] = useState<Consultant[]>(
    TEAM.map((person) => ({
      id: person.id,
      name: person.name,
      role: person.role,
      phone: person.phone,
      phoneDisplay: person.phoneDisplay,
      icon: person.icon,
      bio: "",
      whatsapp: "",
      telegram: "",
      eitaa: "",
      instagram: "",
      rubika: "",
      bale: "",
      igap: "",
      soroush: "",
      sortOrder: 0,
      isActive: true,
    })),
  );

  useEffect(() => {
    let cancelled = false;
    void listConsultants().then((items) => {
      if (!cancelled && items.length) setConsultants(items);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="admin-consultant">
      <p className="admin-consultant-hint">مشاور مسئول این فایل را انتخاب کنید:</p>
      <div className="admin-consultant-grid" role="listbox" aria-label="انتخاب مشاور مسئول">
        {consultants.map((person) => {
          const active =
            normalizePhone(person.phone) === phoneNorm ||
            person.name === nameTrim ||
            person.id === nameTrim;
          const Icon = person.icon === "handshake" ? Handshake : Briefcase;
          return (
            <button
              key={person.id}
              type="button"
              role="option"
              aria-selected={active}
              className={`admin-consultant-card${active ? " is-active" : ""}`}
              onClick={() => onSelect(person)}
            >
              <span className="admin-consultant-icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              <span className="admin-consultant-meta">
                <strong>{person.name}</strong>
                <small>{person.role}</small>
                <span dir="ltr">{person.phoneDisplay}</span>
              </span>
              {active ? (
                <span className="admin-consultant-check" aria-hidden="true">
                  <Check size={16} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <label className="field admin-consultant-select">
        <span className="sr-only">انتخاب سریع مشاور</span>
        <select
          value={
            consultants.find(
              (p) =>
                normalizePhone(p.phone) === phoneNorm || p.name === nameTrim,
            )?.id ?? ""
          }
          onChange={(e) => {
            const member = consultants.find((p) => p.id === e.target.value);
            if (member) onSelect(member);
          }}
        >
          <option value="" disabled>
            انتخاب مشاور…
          </option>
          {consultants.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name} — {person.role}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

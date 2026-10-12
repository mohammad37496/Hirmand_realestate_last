import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { TEAM } from "@/lib/site";
import { listConsultants, type Consultant } from "@/lib/consultants";

function bundledConsultants(): Consultant[] {
  return TEAM.map((person, index) => ({
    id: person.id,
    name: person.name,
    role: person.role,
    phone: person.phone,
    phoneDisplay: person.phoneDisplay,
    icon: person.icon,
    bio: "ارتباط مستقیم برای فایل‌ها و پیگیری درخواست‌های ملکی در هیرمند.",
    whatsapp: person.wa,
    telegram: "https://t.me/Hirmand_realestate",
    eitaa: "https://eitaa.com/Hirmand_realestate",
    instagram: "https://ig.me/m/hirmand.realestate",
    rubika: "",
    bale: "",
    igap: "",
    soroush: "",
    sortOrder: (index + 1) * 10,
    isActive: true,
  }));
}

const FALLBACK_CONSULTANTS = bundledConsultants();
const ConsultantsContext = createContext<Consultant[]>(FALLBACK_CONSULTANTS);

export function ConsultantsProvider({ children }: { children: ReactNode }) {
  const [consultants, setConsultants] = useState<Consultant[]>(FALLBACK_CONSULTANTS);

  useEffect(() => {
    let cancelled = false;

    void listConsultants()
      .then((rows) => {
        if (!cancelled && rows.length) setConsultants(rows);
      })
      .catch(() => {
        // The bundled Hirmand team remains available when the database is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return <ConsultantsContext.Provider value={consultants}>{children}</ConsultantsContext.Provider>;
}

export function useConsultants() {
  return useContext(ConsultantsContext);
}

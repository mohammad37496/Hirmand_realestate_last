export const PROPERTY_CABINET_OPTIONS = [
  { value: "mdf", label: "MDF" },
  { value: "high_gloss", label: "هایگلاس" },
  { value: "membrane", label: "ممبران" },
  { value: "melamine", label: "ملامینه" },
  { value: "wood", label: "چوبی" },
  { value: "metal", label: "فلزی" },
  { value: "mixed", label: "ترکیبی" },
  { value: "custom", label: "سفارشی" },
] as const;

export const PROPERTY_FLOORING_OPTIONS = [
  { value: "ceramic", label: "سرامیک" },
  { value: "stone", label: "سنگ" },
  { value: "parquet", label: "پارکت" },
  { value: "laminate", label: "لمینت" },
  { value: "mosaic", label: "موزاییک" },
  { value: "wood", label: "چوبی" },
  { value: "epoxy", label: "اپوکسی" },
  { value: "mixed", label: "ترکیبی" },
  { value: "other", label: "سایر" },
] as const;

export const PROPERTY_COOLING_OPTIONS = [
  { value: "split", label: "اسپلیت" },
  { value: "duct_split", label: "داکت اسپلیت" },
  { value: "gas_cooler", label: "کولر گازی" },
  { value: "water_cooler", label: "کولر آبی" },
  { value: "fan_coil", label: "فن‌کویل" },
  { value: "central", label: "سیستم مرکزی" },
  { value: "chiller", label: "چیلر" },
  { value: "evaporative", label: "تبخیری" },
  { value: "none", label: "ندارد" },
] as const;

export const PROPERTY_HEATING_OPTIONS = [
  { value: "package_radiator", label: "پکیج و رادیاتور" },
  { value: "central_radiator", label: "شوفاژ مرکزی" },
  { value: "motorhouse", label: "موتورخانه" },
  { value: "underfloor", label: "گرمایش از کف" },
  { value: "fan_coil", label: "فن‌کویل" },
  { value: "central", label: "سیستم مرکزی" },
  { value: "chiller", label: "چیلر" },
  { value: "heater", label: "بخاری" },
  { value: "fireplace", label: "شومینه" },
  { value: "heat_pump", label: "هیت‌پمپ" },
  { value: "none", label: "ندارد" },
] as const;

export const PROPERTY_WALL_CLOSET_OPTIONS = [
  { value: "none", label: "ندارد" },
  { value: "mdf", label: "MDF" },
  { value: "melamine", label: "ملامینه" },
  { value: "wood", label: "چوبی" },
  { value: "full_wall", label: "سرتاسری" },
  { value: "walk_in", label: "رختکن / Walk-in" },
  { value: "mixed", label: "ترکیبی" },
] as const;

export const PROPERTY_OTHER_AMENITY_OPTIONS = [
  { value: "balcony", label: "بالکن" },
  { value: "terrace", label: "تراس" },
  { value: "roof_garden", label: "روف‌گاردن" },
  { value: "yard", label: "حیاط" },
  { value: "private_yard", label: "حیاط اختصاصی" },
  { value: "patio", label: "حیاط خلوت" },
  { value: "roof_access", label: "پشت‌بام قابل استفاده" },
  { value: "master_bedroom", label: "اتاق مستر" },
  { value: "walk_in_closet", label: "کلوزت‌روم" },
  { value: "guest_room", label: "اتاق مهمان" },
  { value: "laundry", label: "رختشویی / لاندری" },
  { value: "maid_room", label: "اتاق سرایداری / خدمتکار" },
  { value: "storage_room", label: "اتاق انباری" },
  { value: "double_glazed", label: "پنجره دوجداره" },
  { value: "soundproof", label: "عایق صوتی" },
  { value: "thermal_insulation", label: "عایق حرارتی" },
  { value: "security_door", label: "درب ضدسرقت" },
  { value: "video_intercom", label: "آیفون تصویری" },
  { value: "smart_home", label: "خانه هوشمند" },
  { value: "central_vacuum", label: "جاروبرقی مرکزی" },
  { value: "water_purifier", label: "دستگاه تصفیه آب" },
  { value: "water_tank", label: "منبع آب" },
  { value: "pressure_pump", label: "پمپ آب" },
  { value: "generator", label: "برق اضطراری / ژنراتور" },
  { value: "solar", label: "سیستم خورشیدی" },
  { value: "fire_alarm", label: "اعلام حریق" },
  { value: "security_system", label: "سیستم امنیتی" },
  { value: "cctv", label: "دوربین مداربسته" },
  { value: "doorman", label: "نگهبان / سرایدار" },
  { value: "lobby", label: "لابی" },
  { value: "gym", label: "سالن ورزشی" },
  { value: "pool", label: "استخر" },
  { value: "sauna", label: "سونا" },
  { value: "jacuzzi", label: "جکوزی" },
  { value: "sport_ground", label: "زمین ورزشی" },
  { value: "children_playground", label: "فضای بازی کودک" },
  { value: "coworking", label: "فضای کار مشترک" },
  { value: "meeting_room", label: "اتاق جلسه" },
  { value: "commercial_permission", label: "مجوز اداری / تجاری" },
  { value: "separate_entrance", label: "ورودی مستقل" },
  { value: "reception", label: "پذیرایی / لابی اختصاصی" },
  { value: "open_kitchen", label: "آشپزخانه اپن" },
  { value: "island_kitchen", label: "جزیره آشپزخانه" },
  { value: "dirty_kitchen", label: "آشپزخانه کثیف" },
  { value: "roof_storage", label: "انباری پشت‌بام" },
  { value: "private_park", label: "پارکینگ اختصاصی" },
  { value: "guest_park", label: "پارکینگ مهمان" },
  { value: "mechanized_park", label: "پارکینگ مکانیزه" },
  { value: "ev_charger", label: "شارژر خودروی برقی" },
  { value: "pet_friendly", label: "مناسب نگهداری حیوان خانگی" },
  { value: "wheelchair_access", label: "دسترسی مناسب ویلچر" },
  { value: "elevator_private", label: "آسانسور اختصاصی" },
] as const;

export type PropertyCabinetType = (typeof PROPERTY_CABINET_OPTIONS)[number]["value"];
export type PropertyFlooringType = (typeof PROPERTY_FLOORING_OPTIONS)[number]["value"];
export type PropertyCoolingSystem = (typeof PROPERTY_COOLING_OPTIONS)[number]["value"];
export type PropertyHeatingSystem = (typeof PROPERTY_HEATING_OPTIONS)[number]["value"];
export type PropertyWallClosetType = (typeof PROPERTY_WALL_CLOSET_OPTIONS)[number]["value"];
export type PropertyOtherAmenity = (typeof PROPERTY_OTHER_AMENITY_OPTIONS)[number]["value"];

export function labelForOption(
  options: readonly { value: string; label: string }[],
  value: string | null | undefined,
) {
  return value ? options.find((item) => item.value === value)?.label ?? value : "";
}

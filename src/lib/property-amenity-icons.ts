import {
  Accessibility,
  AirVent,
  Archive,
  ArrowUpDown,
  Baby,
  Ban,
  BatteryCharging,
  Bath,
  BedDouble,
  BellRing,
  Building2,
  Camera,
  Car,
  CarFront,
  ChefHat,
  CookingPot,
  DoorOpen,
  Droplet,
  Droplets,
  Dumbbell,
  Fan,
  Fence,
  FileCheck,
  Flame,
  Flower2,
  Gauge,
  House,
  Laptop,
  LockKeyhole,
  PanelsTopLeft,
  PawPrint,
  Presentation,
  Ruler,
  ShieldCheck,
  Shirt,
  Smartphone,
  Snowflake,
  Sparkles,
  Sprout,
  Sun,
  Thermometer,
  TreePine,
  Trees,
  Trophy,
  UserRoundCheck,
  UsersRound,
  Utensils,
  Video,
  VolumeX,
  WashingMachine,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  PROPERTY_COOLING_OPTIONS,
  PROPERTY_HEATING_OPTIONS,
  PROPERTY_OTHER_AMENITY_OPTIONS,
  type PropertyCoolingSystem,
  type PropertyHeatingSystem,
  type PropertyOtherAmenity,
} from "./property-options.ts";

/**
 * Visual metadata belongs in the UI, not in PostgreSQL. The database stores
 * stable amenity keys (e.g. "pool" or "wheelchair_access"); this map translates
 * those keys into the matching Lucide icon without changing stored property data.
 */
export const PROPERTY_OTHER_AMENITY_ICONS: Record<PropertyOtherAmenity, LucideIcon> = {
  balcony: Fence,
  terrace: Sun,
  roof_garden: TreePine,
  yard: Trees,
  private_yard: Sprout,
  patio: Flower2,
  roof_access: House,
  master_bedroom: BedDouble,
  walk_in_closet: Shirt,
  guest_room: UsersRound,
  laundry: WashingMachine,
  maid_room: UserRoundCheck,
  storage_room: Archive,
  double_glazed: PanelsTopLeft,
  soundproof: VolumeX,
  thermal_insulation: Thermometer,
  security_door: LockKeyhole,
  video_intercom: Video,
  smart_home: Smartphone,
  central_vacuum: Wind,
  water_purifier: Droplet,
  water_tank: Droplets,
  pressure_pump: Gauge,
  generator: BatteryCharging,
  solar: Sun,
  fire_alarm: Flame,
  security_system: ShieldCheck,
  cctv: Camera,
  doorman: UserRoundCheck,
  lobby: Building2,
  gym: Dumbbell,
  pool: Waves,
  sauna: Thermometer,
  jacuzzi: Bath,
  sport_ground: Trophy,
  children_playground: Baby,
  coworking: Laptop,
  meeting_room: Presentation,
  commercial_permission: FileCheck,
  separate_entrance: DoorOpen,
  reception: BellRing,
  open_kitchen: ChefHat,
  island_kitchen: CookingPot,
  dirty_kitchen: Utensils,
  roof_storage: Archive,
  private_park: CarFront,
  guest_park: Car,
  mechanized_park: ArrowUpDown,
  ev_charger: Zap,
  pet_friendly: PawPrint,
  wheelchair_access: Accessibility,
  elevator_private: ArrowUpDown,
};

export const PROPERTY_COOLING_SYSTEM_ICONS: Record<PropertyCoolingSystem, LucideIcon> = {
  split: Snowflake,
  duct_split: Wind,
  gas_cooler: AirVent,
  water_cooler: Droplets,
  fan_coil: Fan,
  central: Building2,
  chiller: Snowflake,
  evaporative: Droplet,
  none: Ban,
};

export const PROPERTY_HEATING_SYSTEM_ICONS: Record<PropertyHeatingSystem, LucideIcon> = {
  package_radiator: Thermometer,
  central_radiator: Thermometer,
  motorhouse: Flame,
  underfloor: Thermometer,
  fan_coil: Fan,
  central: Building2,
  chiller: Snowflake,
  heater: Flame,
  fireplace: Flame,
  heat_pump: Zap,
  none: Ban,
};

type OptionLike = { value: string; label: string };

function normalizeFeature(value: string): string {
  return value.trim().toLocaleLowerCase("fa-IR").replace(/\s+/g, " ");
}

function findOption<T extends OptionLike>(
  options: readonly T[],
  value: string,
): T | undefined {
  const needle = normalizeFeature(value);
  return options.find(
    (option) =>
      normalizeFeature(option.value) === needle ||
      normalizeFeature(option.label) === needle,
  );
}

/**
 * Resolves either a stored DB key, a catalog label, or a legacy/imported
 * free-text feature. All recognized catalog values get their semantic icon;
 * unknown consultant-entered text gets a neutral feature icon rather than a
 * misleading universal checkmark.
 */
export function getPropertyFeatureIcon(value: string): LucideIcon {
  const raw = value.trim();
  if (!raw) return Sparkles;

  const separator = raw.indexOf(":");
  if (separator > 0) {
    const namespace = normalizeFeature(raw.slice(0, separator));
    const key = raw.slice(separator + 1).trim();
    if (namespace === "cooling") {
      const option = findOption(PROPERTY_COOLING_OPTIONS, key);
      if (option) return PROPERTY_COOLING_SYSTEM_ICONS[option.value as PropertyCoolingSystem];
    }
    if (namespace === "heating") {
      const option = findOption(PROPERTY_HEATING_OPTIONS, key);
      if (option) return PROPERTY_HEATING_SYSTEM_ICONS[option.value as PropertyHeatingSystem];
    }
  }

  const amenity = findOption(PROPERTY_OTHER_AMENITY_OPTIONS, raw);
  if (amenity) {
    return PROPERTY_OTHER_AMENITY_ICONS[amenity.value as PropertyOtherAmenity];
  }

  const cooling = findOption(PROPERTY_COOLING_OPTIONS, raw);
  if (cooling) return PROPERTY_COOLING_SYSTEM_ICONS[cooling.value as PropertyCoolingSystem];

  const heating = findOption(PROPERTY_HEATING_OPTIONS, raw);
  if (heating) return PROPERTY_HEATING_SYSTEM_ICONS[heating.value as PropertyHeatingSystem];

  // Divar imports and older property records can contain free-text features.
  // Match their meaning when possible while preserving the original label.
  if (/متراژ|متر مربع|\b(area|sqm|m2)\b/i.test(raw)) return Ruler;
  if (/خواب|اتاق خواب|bed(room)?s?/i.test(raw)) return BedDouble;
  if (/حمام|سرویس بهداشتی|دوش|bath(room)?|toilet|shower/i.test(raw)) return Bath;
  if (/پارکینگ|خودرو|parking|garage/i.test(raw)) return CarFront;
  if (/آسانسور|elevator|lift/i.test(raw)) return ArrowUpDown;
  if (/انباری|اتاق انبار|storage/i.test(raw)) return Archive;
  if (/بالکن|تراس|روف.?گاردن|حیاط|باغ|فضای سبز|terrace|balcony|garden|yard/i.test(raw)) return Trees;
  if (/استخر|سونا|جکوزی|pool|sauna|jacuzzi/i.test(raw)) return Waves;
  if (/سرمایش|کولر|تهویه|air.?condition|cooling/i.test(raw)) return Snowflake;
  if (/گرمایش|شوفاژ|رادیاتور|بخاری|heating|heater/i.test(raw)) return Thermometer;
  if (/آشپزخانه|کابینت|اجاق|kitchen|cabinet/i.test(raw)) return ChefHat;
  if (/امنیت|ضد.?سرقت|دوربین|نگهبان|security|camera|cctv/i.test(raw)) return ShieldCheck;
  if (/حیوان|حیوان خانگی|pet/i.test(raw)) return PawPrint;
  if (/ویلچر|معلول|دسترسی|wheelchair|accessible/i.test(raw)) return Accessibility;
  if (/شارژ|برق|ژنراتور|solar|خورشیدی|electric/i.test(raw)) return Zap;

  return Sparkles;
}

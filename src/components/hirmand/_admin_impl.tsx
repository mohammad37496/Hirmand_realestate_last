import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Copy,
  ExternalLink,
  FileEdit,
  FileText,
  Home,
  KeyRound,
  LayoutDashboard,
  Menu,
  Music2,
  UsersRound,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Search,
  Star,
  Trash2,
  X,
  Filter,
  ArrowUpDown,
  Globe2,
  GitCompareArrows,
  Download,
  MessageCircle,
  CheckSquare,
  ChevronDown,
  Clock3,
  UserCog,
  WalletCards,
  DatabaseBackup,
  ListTodo,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  CalendarClock,
  ArchiveRestore,
  ClipboardList,
  Settings,
  HardDrive,
  Route as RouteIcon,
  Target,
} from "lucide-react";
import { NEIGHBORHOOD_NAMES, PROPERTY_TYPES, SITE, TEAM } from "@/lib/site";
import { isInvalidIntegerInput, normalizeMoneyText } from "@/lib/property-input-normalization";
import { listNeighborhoodNames } from "@/lib/neighborhoods";
import { listConsultants, type Consultant } from "@/lib/consultants";
import { propertyPath } from "@/lib/property-path";
import { getPropertyFallbackImage } from "@/lib/property-fallback-images";
import type { Property, PropertyAvailabilityStatus, PropertyType, PropertyTransaction } from "@/lib/properties";
import {
  bulkAssignPropertyConsultant,
  bulkDeleteProperties,
  bulkSetPropertyFeatured,
  bulkUpdatePropertyStatus,
  countAdminProperties,
  countFilteredAdminProperties,
  deleteProperty,
  listAdminProperties,
  listPropertyChangeHistory,
  saveProperty,
} from "@/lib/properties";
import { toast, Toaster } from "sonner";
import {
  AdminErrorBanner,
  AdminListSkeleton,
  AdminPagination,
} from "@/components/hirmand/admin-ui";
import { adminErrorMessage, fa, useConfirmDialog, useOverlayDismiss } from "@/components/hirmand/admin-ui-utils";
import { AdminMediaField } from "@/components/hirmand/admin-media-field";
import { AdminFloorPlanField } from "@/components/hirmand/admin-floor-plan-field";
import { AdminPropertyDuplicateCheck } from "@/components/hirmand/admin-property-duplicate-check";
import { AdminLocationPicker } from "@/components/hirmand/admin-location-picker";
import { AdminPricingPanel } from "@/components/hirmand/admin-pricing-panel";
import { AdminConsultantPicker } from "@/components/hirmand/admin-consultant-picker";
import { AdminMusicManager } from "@/components/hirmand/admin-music-manager";
import { AdminLeadManager } from "@/components/hirmand/admin-lead-manager";
import { AdminCustomerInbox } from "@/components/hirmand/admin-customer-inbox";
import { AdminDashboard } from "@/components/hirmand/admin-dashboard";
import { AdminSalesFunnel } from "@/components/hirmand/admin-sales-funnel";
import { AdminManagementReport } from "@/components/hirmand/admin-management-report";
import { ADMIN_CSS } from "@/components/hirmand/admin-shell-css";
import { AdminListingAssistant } from "@/components/hirmand/admin-listing-assistant";
import { AdminPublishReadiness } from "@/components/hirmand/admin-publish-readiness";
import { AdminPartnerManager } from "@/components/hirmand/admin-partner-manager";
import { AdminConsultantManager } from "@/components/hirmand/admin-consultant-manager";
import { AdminDivarFiles } from "@/components/hirmand/admin-divar-files";
import { AdminAttendanceManager } from "@/components/hirmand/admin-attendance-manager";
import { AdminMatchingManager } from "@/components/hirmand/admin-matching-manager";
import { AdminOwnerManager } from "@/components/hirmand/admin-owner-manager";
import { AdminFinanceManager } from "@/components/hirmand/admin-finance-manager";
import { AdminWatermarkSettings } from "@/components/hirmand/admin-watermark-settings";
import { AdminBackupManager } from "@/components/hirmand/admin-backup-manager";
import { AdminOperationsCenter } from "@/components/hirmand/admin-operations-center";
import { AdminProductivityCenter } from "@/components/hirmand/admin-productivity-center";
import { AdminPropertyPerformance } from "@/components/hirmand/admin-property-performance";
import { AdminPropertyPriceHistory } from "@/components/hirmand/admin-property-price-history";
import { AdminCommandPalette } from "@/components/hirmand/admin-command-palette";
import { AdminPropertyQuestions, AdminPropertyOpenHouse } from "@/components/hirmand/admin-property-features";
import { AdminPropertyFilterPresets } from "@/components/hirmand/admin-property-filter-presets";
import { AdminScheduleManager } from "@/components/hirmand/admin-schedule-manager";
import { AdminTrashManager } from "@/components/hirmand/admin-trash-manager";
import { AdminAuditLog } from "@/components/hirmand/admin-audit-log";
import "@/admin-automation.css";
import { AdminSiteSettings } from "@/components/hirmand/admin-site-settings";
import { AdminMediaHealth } from "@/components/hirmand/admin-media-health";
import { AdminSecurityCenter } from "@/components/hirmand/admin-security-center";
import { AdminSeoRedirects } from "@/components/hirmand/admin-seo-redirects";
import { AdminContentStudio } from "@/components/hirmand/admin-content-studio";
import { AdminPublicationQueue } from "@/components/hirmand/admin-publication-queue";
import { AdminKpiHistory } from "@/components/hirmand/admin-kpi-history";
import { AdminDataHealth } from "@/components/hirmand/admin-data-health";
import { AdminDealsManager } from "@/components/hirmand/admin-deals";
import { AdminPropertyExpiryCenter } from "@/components/hirmand/admin-property-expiry";
import { AdminCommissionSettlement } from "@/components/hirmand/admin-commission-settlement";
import { AdminFinanceInsights } from "@/components/hirmand/admin-finance-insights";
import { AdminConsultantPerformance } from "@/components/hirmand/admin-consultant-performance";
import { AdminConsultantTargets } from "@/components/hirmand/admin-consultant-targets";
import { AdminPropertyPreview } from "@/components/hirmand/admin-property-preview";
import "@/admin-site-settings.css";
import "@/admin-security.css";
import "@/admin-seo-redirects.css";
import "@/admin-content-studio.css";
import "@/admin-property-performance.css";
import "@/property-feature-enhancements.css";
import "@/admin-customer-inbox.css";
import {
  PROPERTY_CABINET_OPTIONS,
  PROPERTY_COOLING_OPTIONS,
  PROPERTY_FLOORING_OPTIONS,
  PROPERTY_HEATING_OPTIONS,
  PROPERTY_OTHER_AMENITY_OPTIONS,
  PROPERTY_WALL_CLOSET_OPTIONS,
} from "@/lib/property-options";
import { getPublishReadiness } from "@/lib/property-publish-readiness";
import { ADMIN_ROLE_LABELS, hasAdminPermission, normalizeAdminRole, type AdminRole } from "@/lib/admin-roles";
import { requestPropertyPublication } from "@/lib/admin-publication";

type PublishStatus = "draft" | "published" | "archived";
const AVAILABILITY_LABEL: Record<PropertyAvailabilityStatus, string> = {
  available: "موجود",
  reserved: "رزرو موقت",
  sold: "فروخته‌شده",
  rented: "اجاره‌داده‌شده",
  unavailable: "فعلاً ناموجود",
};
type ViewMode = "staffHome" | "dashboard" | "managementReport" | "integrity" | "deals" | "expiry" | "commission" | "consultantPerformance" | "consultantTargets" | "productivity" | "list" | "form" | "music" | "leads" | "messages" | "partners" | "divar" | "consultants" | "attendance" | "matching" | "owners" | "finance" | "backup" | "watermark" | "schedule" | "trash" | "audit" | "settings" | "mediaHealth" | "security" | "seoRedirects" | "contentStudio";

type ListSort = "newest" | "oldest" | "updated" | "title" | "price_asc" | "price_desc" | "area_desc";
type MediaFilter = "all" | "with" | "without";

const LIST_SORT_OPTIONS: { value: ListSort; label: string }[] = [
  { value: "newest", label: "جدیدترین ایجاد" },
  { value: "updated", label: "آخرین بروزرسانی" },
  { value: "oldest", label: "قدیمی‌ترین ایجاد" },
  { value: "title", label: "عنوان (الفبایی)" },
  { value: "price_desc", label: "بیشترین قیمت" },
  { value: "price_asc", label: "کمترین قیمت" },
  { value: "area_desc", label: "بیشترین متراژ" },
];

const DEFAULT_PAGE_SIZE = 20;

/**
 * Draft autosave.
 *
 * A half-filled property form is expensive to recreate, but owner contact
 * details are sensitive, so they are deliberately excluded from the draft.
 * `sessionStorage` (not `localStorage`) means the draft dies with the tab and
 * never lingers on a shared machine's disk.
 */
const DRAFT_KEY = "hirmand:admin:property-draft";

type DraftShape = Omit<FormState, "ownerName" | "ownerPhone" | "ownerInfo"> & {
  savedAt: string;
};

function loadDraft(key: string): DraftShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${DRAFT_KEY}:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftShape;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveDraft(key: string, form: FormState) {
  if (typeof window === "undefined") return;
  try {
    const { ownerName, ownerPhone, ownerInfo, ...safe } = form;
    void ownerName;
    void ownerPhone;
    void ownerInfo;
    window.sessionStorage.setItem(
      `${DRAFT_KEY}:${key}`,
      JSON.stringify({ ...safe, savedAt: new Date().toISOString() }),
    );
  } catch {
    // A full or blocked storage must never block editing.
  }
}

function clearDraft(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(`${DRAFT_KEY}:${key}`);
  } catch {
    // Ignore: the draft is an optimisation, not a source of truth.
  }
}

type FormState = {
  id?: string;
  title: string;
  transactionType: PropertyTransaction;
  propertyType: PropertyType;
  neighborhood: string;
  address: string;
  areaM2: string;
  bedrooms: string;
  bathrooms: string;
  floor: string;
  floorLabel: Property["floorLabel"];
  orientation: Property["orientation"];
  totalFloors: string;
  builtYear: string;
  parking: boolean;
  elevator: boolean;
  storage: boolean;
  painted: boolean;
  wallpaper: boolean;
  convertible: boolean;
  cabinetType: Property["cabinetType"];
  flooringType: Property["flooringType"];
  coolingSystem: Property["coolingSystem"];
  heatingSystem: Property["heatingSystem"];
  wallClosetType: Property["wallClosetType"];
  otherAmenities: string[];
  price: string;
  deposit: string;
  rent: string;
  description: string;
  features: string;
  images: string;
  floorPlanUrl: string;
  contactName: string;
  contactPhone: string;
  ownerName: string;
  ownerPhone: string;
  ownerInfo: string;
  status: PublishStatus;
  availabilityStatus: PropertyAvailabilityStatus;
  featured: boolean;
  featuredUntil: string;
  latitude: number | null;
  longitude: number | null;
  virtualTourUrl: string;
  internalPriority: "low" | "normal" | "high" | "urgent";
  internalNote: string;
};

const STATUS_LABEL: Record<PublishStatus, string> = {
  published: "منتشرشده",
  draft: "پیش‌نویس",
  archived: "بایگانی",
};
const TX_OPTIONS: { value: PropertyTransaction; label: string }[] = [
  { value: "sell", label: "فروش" },
  { value: "buy", label: "خرید (درخواست)" },
  { value: "rent", label: "اجاره" },
  { value: "mortgage", label: "رهن" },
];

function emptyForm(): FormState {
  return {

    title: "",
    transactionType: "sell",
    propertyType: "apartment",
    neighborhood: "",
    address: "",
    areaM2: "",
    bedrooms: "",
    bathrooms: "",
    floor: "",
    floorLabel: null,
    orientation: null,
    totalFloors: "",
    builtYear: "",
    parking: false,
    elevator: false,
    storage: false,
    painted: false,
    wallpaper: false,
    convertible: false,
    cabinetType: null,
    flooringType: null,
    coolingSystem: null,
    heatingSystem: null,
    wallClosetType: null,
    otherAmenities: [],
    price: "",
    deposit: "",
    rent: "",
    description: "",
    features: "",
    images: "",
    floorPlanUrl: "",
    contactName: TEAM[0]?.name ?? "مشاور هیرمند",
    contactPhone: TEAM[0]?.phone ?? SITE.phone.mobile,
    ownerName: "",
    ownerPhone: "",
    ownerInfo: "",
    status: "draft",
    availabilityStatus: "available",
    featured: false,
    featuredUntil: "",
    latitude: null,
    longitude: null,
    virtualTourUrl: "",
    internalPriority: "normal",
    internalNote: "",
  };
}

const ORIENTATION_OPTIONS: { value: NonNullable<Property["orientation"]>; label: string }[] = [
  { value: "north", label: "شمالی" },
  { value: "south", label: "جنوبی" },
  { value: "east", label: "شرقی" },
  { value: "west", label: "غربی" },
  { value: "northeast", label: "شمال‌شرقی" },
  { value: "northwest", label: "شمال‌غربی" },
  { value: "southeast", label: "جنوب‌شرقی" },
  { value: "southwest", label: "جنوب‌غربی" },
  { value: "two_fronts", label: "دو نبش" },
  { value: "three_fronts", label: "سه نبش" },
  { value: "four_fronts", label: "چهار نبش" },
  { value: "other", label: "سایر" },
];

const FLOOR_OPTIONS = Array.from({ length: 261 }, (_, index) => index - 60).map((value) => ({
  value: String(value),
  label: value === 0 ? "همکف (۰)" : value < 0 ? `منفی ${Math.abs(value).toLocaleString("fa-IR")}` : value.toLocaleString("fa-IR"),
}));

function toEnglishDigits(raw: string) {
  return raw
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}
function numberOrNull(raw: string, allowNegative = false) {
  const digits = toEnglishDigits(raw).trim().replace(/[٬،,\s]/g, "");
  if (!digits) return null;
  if (!/^-?\d+$/.test(digits)) return null;
  const value = Number(digits);
  if (!Number.isInteger(value) || !Number.isFinite(value)) return null;
  return allowNegative || value >= 0 ? value : null;
}

function moneyOrNull(raw: string) {
  const normalized = normalizeMoneyText(raw);
  return normalized && /^\d{1,20}$/.test(normalized) ? normalized : null;
}

function hasInvalidMoney(raw: string) {
  const normalized = normalizeMoneyText(raw);
  return Boolean(normalized) && !/^\d{1,20}$/.test(normalized);
}

function hasInvalidPropertyIntegerInputs(form: Pick<
  FormState,
  "areaM2" | "bedrooms" | "bathrooms" | "floor" | "totalFloors" | "builtYear"
>) {
  return (
    isInvalidIntegerInput(form.areaM2) ||
    isInvalidIntegerInput(form.bedrooms) ||
    isInvalidIntegerInput(form.bathrooms) ||
    isInvalidIntegerInput(form.floor, true) ||
    isInvalidIntegerInput(form.totalFloors) ||
    isInvalidIntegerInput(form.builtYear)
  );
}

function getPublishReadinessForForm(form: FormState) {
  return getPublishReadiness({
    transactionType: form.transactionType,
    title: form.title,
    neighborhood: form.neighborhood,
    description: form.description,
    contactName: form.contactName,
    contactPhone: form.contactPhone,
    price: form.price,
    deposit: form.deposit,
    rent: form.rent,
    imageCount: form.images.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean).length,
    areaM2: form.areaM2,
    features: form.features,
    latitude: form.latitude,
    longitude: form.longitude,
  });
}
function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (item: number) => String(item).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function splitLines(raw: string) {
  return raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}
function parseImageUrls(raw: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const line of splitLines(raw)) {
    try {
      const u = new URL(line);
      if (u.protocol === "http:" || u.protocol === "https:") valid.push(line);
      else invalid.push(line);
    } catch {
      invalid.push(line);
    }
  }
  return { valid, invalid };
}

function propertyQuality(property: Property) {
  let score = 0;
  const title = property.title.trim();
  const description = property.description.trim();
  const contact = property.contactName.trim() && property.contactPhone.trim();
  const hasPrice =
    property.transactionType === "sell" || property.transactionType === "buy"
      ? Boolean(property.price)
      : property.transactionType === "rent"
        ? Boolean(property.deposit || property.rent)
        : Boolean(property.deposit);

  if (title.length >= 12) score += 20;
  if (description.length >= 120) score += 25;
  if (property.images.length >= 3) score += 20;
  if (property.address?.trim()) score += 15;
  if (contact) score += 10;
  if (hasPrice) score += 10;

  return {
    score,
    complete: score >= 80,
    label: score >= 80 ? "کامل" : score >= 60 ? "قابل انتشار" : "نیازمند تکمیل",
  };
}

function propertyToForm(property: Property): FormState {
  return {
    id: property.id,
    title: property.title,
    transactionType: property.transactionType,
    propertyType: property.propertyType,
    neighborhood: property.neighborhood,
    address: property.address ?? "",
    areaM2: property.areaM2 != null ? String(property.areaM2) : "",
    bedrooms: property.bedrooms != null ? String(property.bedrooms) : "",
    bathrooms: property.bathrooms != null ? String(property.bathrooms) : "",
    floor: property.floor != null ? String(property.floor) : "",
    floorLabel: property.floorLabel ?? null,
    orientation: property.orientation ?? null,
    totalFloors: property.totalFloors != null ? String(property.totalFloors) : "",
    builtYear: property.builtYear != null ? String(property.builtYear) : "",
    parking: property.parking,
    elevator: property.elevator,
    storage: property.storage,
    painted: property.painted,
    wallpaper: property.wallpaper,
    convertible: property.convertible,
    cabinetType: property.cabinetType ?? null,
    flooringType: property.flooringType ?? null,
    coolingSystem: property.coolingSystem ?? null,
    heatingSystem: property.heatingSystem ?? null,
    wallClosetType: property.wallClosetType ?? null,
    otherAmenities: [...(property.otherAmenities ?? [])],
    price: property.price != null ? String(property.price) : "",
    deposit: property.deposit != null ? String(property.deposit) : "",
    rent: property.rent != null ? String(property.rent) : "",
    description: property.description ?? "",
    features: (property.features ?? []).join("\n"),
    images: (property.images ?? []).join("\n"),
    floorPlanUrl: property.floorPlanUrl ?? "",
    contactName: property.contactName,
    contactPhone: property.contactPhone,
    ownerName: property.ownerName ?? "",
    ownerPhone: property.ownerPhone ?? "",
    ownerInfo: property.ownerInfo ?? "",
    status: property.status,
    availabilityStatus: property.availabilityStatus,
    featured: property.featured,
    featuredUntil: toDateTimeLocal(property.featuredUntil),
    latitude: property.latitude,
    longitude: property.longitude,
    virtualTourUrl: property.virtualTourUrl ?? "",
    internalPriority: property.internalPriority ?? "normal",
    internalNote: property.internalNote ?? "",
  };
}

export function AdminPropertiesPage({ mode = "admin" }: { mode?: "admin" | "staff" } = {}) {
  const staffMode = mode === "staff";
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [loginMode, setLoginMode] = useState<"key" | "account">(staffMode ? "account" : "key");
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [adminRole, setAdminRole] = useState<AdminRole>("owner");
  const [unlocked, setUnlocked] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyHasMore, setPropertyHasMore] = useState(false);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [serverStats, setServerStats] = useState<{
    total: number;
    published: number;
    draft: number;
    archived: number;
    featured: number;
  } | null>(null);
  const propertyRequestId = useRef(0);
  const submitting = useRef(false);
  const draftKeyRef = useRef("new");
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>(staffMode ? "staffHome" : "dashboard");
  const [formDirty, setFormDirty] = useState(false);
  const [listFilter, setListFilter] = useState<"all" | PublishStatus | "featured">("all");
  const [query, setQuery] = useState("");
  const [listTransaction, setListTransaction] = useState<"all" | PropertyTransaction>("all");
  const [listType, setListType] = useState<"all" | PropertyType>("all");
  const [listNeighborhood, setListNeighborhood] = useState("");
  const [listSort, setListSort] = useState<ListSort>("newest");
  const [listMedia, setListMedia] = useState<MediaFilter>("all");
  const [listPriceMin, setListPriceMin] = useState("");
  const [listPriceMax, setListPriceMax] = useState("");
  const [listAreaMin, setListAreaMin] = useState("");
  const [listBedroomsMin, setListBedroomsMin] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [listError, setListError] = useState<string | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const [draftRestored, setDraftRestored] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  // Escape, scroll lock and focus return live in one place so the drawer and
  // the confirm dialog cannot drift apart again.
  useOverlayDismiss({
    open: drawerOpen,
    onClose: closeDrawer,
    initialFocusRef: drawerTriggerRef,
  });

  const navItems = useMemo(
    () => [
      { view: "dashboard" as ViewMode, section: "نمای کلی", label: "داشبورد", icon: BarChart3 },
      { view: "managementReport" as ViewMode, section: "نمای کلی", label: "گزارش مدیریتی", icon: FileText },
      { view: "productivity" as ViewMode, section: "نمای کلی", label: "مرکز مدیریت", icon: ListTodo },
      { view: "integrity" as ViewMode, section: "نمای کلی", label: "سلامت داده", icon: ShieldAlert },
      { view: "deals" as ViewMode, section: "فروش و معاملات", label: "معاملات", icon: BriefcaseBusiness },
      { view: "expiry" as ViewMode, section: "فروش و معاملات", label: "انقضا و تمدید فایل", icon: Clock3 },
      { view: "commission" as ViewMode, section: "فروش و معاملات", label: "تسویه کمیسیون", icon: WalletCards },
      { view: "consultantPerformance" as ViewMode, section: "تیم و روابط", label: "عملکرد مشاوران", icon: BarChart3 },
      { view: "consultantTargets" as ViewMode, section: "تیم و روابط", label: "اهداف مشاوران", icon: Target },

      { view: "list" as ViewMode, section: "فایل‌ها و مشتریان", label: "فایل‌های ملک", icon: LayoutDashboard },
      { view: "leads" as ViewMode, section: "فایل‌ها و مشتریان", label: "درخواست‌ها", icon: UsersRound },
      { view: "messages" as ViewMode, section: "فایل‌ها و مشتریان", label: "گفت‌وگوی مشتری", icon: MessageCircle },
      { view: "matching" as ViewMode, section: "فایل‌ها و مشتریان", label: "مچ کردن", icon: GitCompareArrows },
      { view: "divar" as ViewMode, section: "فایل‌ها و مشتریان", label: "فایل‌های دیوار", icon: Globe2 },

      { view: "consultants" as ViewMode, section: "تیم و روابط", label: "مشاوران", icon: UsersRound },
      { view: "partners" as ViewMode, section: "تیم و روابط", label: "همکاران", icon: UsersRound },
      { view: "owners" as ViewMode, section: "تیم و روابط", label: "مالکین", icon: UserCog },
      { view: "attendance" as ViewMode, section: "تیم و روابط", label: "حضور و غیاب", icon: Clock3 },

      { view: "finance" as ViewMode, section: "مالی و رسانه", label: "دفتر مالی", icon: WalletCards },
      { view: "music" as ViewMode, section: "مالی و رسانه", label: "موسیقی", icon: Music2 },
      { view: "watermark" as ViewMode, section: "مالی و رسانه", label: "واترمارک", icon: ShieldCheck },
      { view: "backup" as ViewMode, section: "مالی و رسانه", label: "پشتیبان", icon: DatabaseBackup },
      { view: "mediaHealth" as ViewMode, section: "مالی و رسانه", label: "سلامت رسانه", icon: HardDrive },

      { view: "schedule" as ViewMode, section: "سیستم و محتوا", label: "زمان‌بندی", icon: CalendarClock },
      { view: "trash" as ViewMode, section: "سیستم و محتوا", label: "سطل بازیابی", icon: ArchiveRestore },
      { view: "audit" as ViewMode, section: "سیستم و محتوا", label: "گزارش فعالیت", icon: ClipboardList },
      { view: "settings" as ViewMode, section: "سیستم و محتوا", label: "تنظیمات سایت", icon: Settings },
      { view: "security" as ViewMode, section: "سیستم و محتوا", label: "امنیت مدیران", icon: ShieldAlert },
      { view: "seoRedirects" as ViewMode, section: "سیستم و محتوا", label: "ریدایرکت و ۴۰۴", icon: RouteIcon },
      { view: "contentStudio" as ViewMode, section: "سیستم و محتوا", label: "استودیو محتوا", icon: FileText },
    ],
    [],
  );

  const visibleNavItems = useMemo(() => {
    if (adminRole === "staff") {
      return [
        { view: "staffHome" as ViewMode, section: "فضای کارکنان", label: "خانه کارکنان", icon: LayoutDashboard },
        ...navItems.filter((item) => item.view === "leads" || item.view === "matching" || item.view === "divar"),
      ];
    }
    if (adminRole === "owner" || adminRole === "manager") return navItems;
    if (adminRole === "sales") {
      const allowed = new Set<ViewMode>(["dashboard", "managementReport", "productivity", "list", "leads", "messages", "matching", "divar", "deals", "expiry", "commission", "consultantPerformance", "consultantTargets"]);
      return navItems.filter((item) => allowed.has(item.view));
    }
    if (adminRole === "content") {
      const allowed = new Set<ViewMode>(["dashboard", "managementReport", "list", "form", "music", "watermark", "mediaHealth", "contentStudio"]);
      return navItems.filter((item) => allowed.has(item.view));
    }
    return navItems.filter((item) => item.view === "dashboard" || item.view === "managementReport");
  }, [navItems, adminRole]);

  const canManageProperties = hasAdminPermission(adminRole, "property.manage");
  const canCreateProperties = hasAdminPermission(adminRole, "property.create") || canManageProperties;
  const canManageLeads = hasAdminPermission(adminRole, "lead.manage");
  const canPublishProperties = hasAdminPermission(adminRole, "property.publish");
  const canManageFinance = hasAdminPermission(adminRole, "finance.manage");
  const canManageContent = hasAdminPermission(adminRole, "content.manage");
  const canManageTeam = adminRole === "owner" || adminRole === "manager";

  const [changeHistory, setChangeHistory] = useState<Array<{
    id: number;
    action: "created" | "updated" | "deleted";
    changedAt: string;
    beforeTitle: string | null;
    beforeStatus: "draft" | "published" | "archived" | null;
    beforeFeatured: boolean | null;
    beforePrice: string | null;
    beforeDeposit: string | null;
    beforeRent: string | null;
    beforeContactName: string | null;
    beforeContactPhone: string | null;
    afterTitle: string | null;
    afterStatus: "draft" | "published" | "archived" | null;
    afterFeatured: boolean | null;
    afterPrice: string | null;
    afterDeposit: string | null;
    afterRent: string | null;
    afterContactName: string | null;
    afterContactPhone: string | null;
    beforeOwnerName: string | null;
    beforeOwnerPhone: string | null;
    beforeOwnerInfo: string | null;
    afterOwnerName: string | null;
    afterOwnerPhone: string | null;
    afterOwnerInfo: string | null;
    beforeState?: unknown;
  }>>([]);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [neighborhoodOptions, setNeighborhoodOptions] = useState<string[]>(NEIGHBORHOOD_NAMES);
  const [assignmentConsultants, setAssignmentConsultants] = useState<Consultant[]>(
    TEAM.map((person, index) => ({
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
      sortOrder: (index + 1) * 10,
      isActive: true,
    })),
  );

  useEffect(() => {
    let cancelled = false;
    void listNeighborhoodNames()
      .then((names) => {
        if (!cancelled && names.length) setNeighborhoodOptions(names);
      })
      .catch(() => {
        // Keep the bundled catalog as a graceful fallback.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listConsultants()
      .then((items) => {
        if (!cancelled && items.length) setAssignmentConsultants(items);
      })
      .catch(() => {
        // Keep the bundled team as a graceful fallback.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormDirty(true);
  }

  function patchForm(patch: (current: FormState) => FormState) {
    setForm(patch);
    setFormDirty(true);
  }

  function navigateTo(nextView: ViewMode) {
    const allowed = nextView === "form"
      ? canCreateProperties
      : visibleNavItems.some((item) => item.view === nextView);
    if (!allowed) {
      toast.error("دسترسی این بخش برای نقش فعلی فعال نیست.");
      return;
    }
    if (view === "form" && nextView !== "form" && formDirty) {
      void (async () => {
        const leave = await confirm({
          title: "تغییرات ذخیره نشده دارید",
          description:
            "اگر از این فرم خارج شوید، تغییراتی که ذخیره نکرده‌اید از بین می‌رود. می‌خواهید خارج شوید؟",
          confirmLabel: "بله، خارج شو",
          cancelLabel: "بمانم",
          tone: "danger",
        });
        if (!leave) return;
        setView(nextView);
        setDrawerOpen(false);
      })();
      return;
    }
    setView(nextView);
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (!unlocked || !form.id) {
      setChangeHistory([]);
      return;
    }

    let cancelled = false;
    void listPropertyChangeHistory({ data: { id: form.id, limit: 10 } })
      .then((items) => {
        if (!cancelled) setChangeHistory(items);
      })
      .catch(() => {
        if (!cancelled) setChangeHistory([]);
      });

    return () => {
      cancelled = true;
    };
  }, [unlocked, form.id]);

  useEffect(() => {
    if (!formDirty || view !== "form") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [formDirty, view]);

  // Draft autosave: keep the expensive part of a long form across an
  // accidental navigation. Owner contact fields are never written.
  useEffect(() => {
    if (view !== "form") return;
    if (!formDirty) return;
    const timer = window.setTimeout(() => saveDraft(draftKeyRef.current, form), 800);
    return () => window.clearTimeout(timer);
  }, [form, formDirty, view]);

  // Restore once per opened record so the banner does not nag after the user
  // keeps editing the restored draft.
  useEffect(() => {
    if (view !== "form" || draftRestored) return;
    const key = form.id ?? "new";
    draftKeyRef.current = key;
    const draft = loadDraft(key);
    if (!draft) return;
    setForm((current) => {
      if (formDirty) return current;
      return {
        ...current,
        ...draft,
        // Owner details always come from the saved record, never the draft.
        ownerName: current.ownerName,
        ownerPhone: current.ownerPhone,
        ownerInfo: current.ownerInfo,
      };
    });
    setFormDirty(true);
    setDraftRestored(key);
  }, [view, form.id, formDirty, draftRestored]);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const response = await fetch("/api/admin/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ action: "login" }),
        });
        const data = (await response.json().catch(() => null)) as
          | { authenticated?: boolean; role?: AdminRole }
          | null;

        if (!data?.authenticated || cancelled) return;
        const role = normalizeAdminRole(data.role);
        if (staffMode && role !== "staff") {
          await fetch("/api/admin/session", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: "logout" }) }).catch(() => {});
          if (!cancelled) setLoginNotice("برای ورود به پنل کارکنان باید با حسابی وارد شوید که نقش «کارمند» دارد.");
          return;
        }
        if (!staffMode && role === "staff") {
          window.location.replace("/staff");
          return;
        }
        setAdminRole(role);
        setView(staffMode ? "staffHome" : "dashboard");

        if (hasAdminPermission(role, "property.manage")) {
          const [rows, totals, filteredCount] = await Promise.all([
            listAdminProperties({ data: { limit: 50, offset: 0 } }),
            countAdminProperties({ data: {} }),
            countFilteredAdminProperties({ data: { limit: 50, offset: 0 } }),
          ]);
          if (cancelled) return;
          setProperties(rows);
          setFilteredTotal(filteredCount);
          setPropertyHasMore(rows.length < filteredCount);
          setServerStats(totals);
        } else {
          setProperties([]);
          setFilteredTotal(0);
          setPropertyHasMore(false);
          setServerStats(null);
        }
        if (cancelled) return;
        setUnlocked(true);
      } catch {
        // No valid session: show the login screen.
      } finally {
        if (!cancelled) setSessionChecking(false);
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [staffMode]);

  /** Parses a Persian/Arabic digit money or number input into a number. */
  function listNumber(raw: string): number | undefined {
    const digits = raw
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .replace(/[٬،,\s]/g, "");
    if (!digits) return undefined;
    if (!/^\d+$/.test(digits)) return undefined;
    const value = Number(digits);
    return Number.isSafeInteger(value) ? value : undefined;
  }

  function currentListFilters(offset: number, limit: number) {
    return {
      limit,
      offset,
      status:
        listFilter !== "all" && listFilter !== "featured"
          ? listFilter
          : undefined,
      transactionType: listTransaction !== "all" ? listTransaction : undefined,
      propertyType: listType !== "all" ? listType : undefined,
      neighborhood: listNeighborhood || undefined,
      featuredOnly: listFilter === "featured",
      search: query.trim() || undefined,
      hasImages: listMedia === "all" ? undefined : listMedia === "with",
      minPrice: listNumber(listPriceMin),
      maxPrice: listNumber(listPriceMax),
      minArea: listNumber(listAreaMin),
      minBedrooms: listNumber(listBedroomsMin),
      sort: listSort,
    } as const;
  }

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (listFilter !== "all") {
      chips.push({
        key: "status",
        label:
          listFilter === "featured"
            ? "فقط ویژه"
            : `وضعیت: ${
                { published: "منتشرشده", draft: "پیش‌نویس", archived: "بایگانی" }[
                  listFilter as PublishStatus
                ]
              }`,
        clear: () => setListFilter("all"),
      });
    }
    if (listTransaction !== "all") {
      chips.push({
        key: "transaction",
        label: `معامله: ${TX_OPTIONS.find((item) => item.value === listTransaction)?.label ?? listTransaction}`,
        clear: () => setListTransaction("all"),
      });
    }
    if (listType !== "all") {
      chips.push({
        key: "type",
        label: `نوع: ${PROPERTY_TYPES.find((item) => item.id === listType)?.title ?? listType}`,
        clear: () => setListType("all"),
      });
    }
    if (listNeighborhood) {
      chips.push({ key: "neighborhood", label: `محله: ${listNeighborhood}`, clear: () => setListNeighborhood("") });
    }
    if (listMedia !== "all") {
      chips.push({
        key: "media",
        label: listMedia === "with" ? "دارای تصویر" : "بدون تصویر",
        clear: () => setListMedia("all"),
      });
    }
    if (listPriceMin) chips.push({ key: "priceMin", label: `از ${fa(listNumber(listPriceMin) ?? 0)}`, clear: () => setListPriceMin("") });
    if (listPriceMax) chips.push({ key: "priceMax", label: `تا ${fa(listNumber(listPriceMax) ?? 0)}`, clear: () => setListPriceMax("") });
    if (listAreaMin) chips.push({ key: "areaMin", label: `متراژ از ${fa(listNumber(listAreaMin) ?? 0)}`, clear: () => setListAreaMin("") });
    if (listBedroomsMin) chips.push({ key: "bedrooms", label: `${fa(listNumber(listBedroomsMin) ?? 0)}+ خواب`, clear: () => setListBedroomsMin("") });
    return chips;
  }, [
    listFilter,
    listTransaction,
    listType,
    listNeighborhood,
    listMedia,
    listPriceMin,
    listPriceMax,
    listAreaMin,
    listBedroomsMin,
  ]);

  function clearAllFilters() {
    setListFilter("all");
    setListTransaction("all");
    setListType("all");
    setListNeighborhood("");
    setListSort("newest");
    setListMedia("all");
    setListPriceMin("");
    setListPriceMax("");
    setListAreaMin("");
    setListBedroomsMin("");
    setQuery("");
    setPage(1);
  }

  async function refresh() {
    if (!unlocked || !canManageProperties) return;
    const requestId = ++propertyRequestId.current;
    setLoadingList(true);
    setListError(null);
    try {
      const filterData = currentListFilters((page - 1) * pageSize, pageSize);
      const [rows, totals, filteredCount] = await Promise.all([
        listAdminProperties({ data: filterData }),
        countAdminProperties({ data: {} }),
        countFilteredAdminProperties({ data: filterData }),
      ]);
      if (requestId !== propertyRequestId.current) return;
      setProperties(rows);
      setFilteredTotal(filteredCount);
      setPropertyHasMore(rows.length < filteredCount);
      setServerStats(totals);
      // A filter change can shrink the result set below the current page.
      const lastPage = Math.max(1, Math.ceil(filteredCount / pageSize));
      if (page > lastPage) setPage(lastPage);
    } catch (error) {
      if (requestId !== propertyRequestId.current) return;
      const message = adminErrorMessage(error, "بارگذاری فایل‌ها انجام نشد.");
      setListError(message);
      toast.error(message);
      return;
    } finally {
      if (requestId === propertyRequestId.current) setLoadingList(false);
    }
  }

  async function unlock(key = keyInput.trim(), showToast = true) {
    if (staffMode && loginMode !== "account") {
      toast.error("ورود کارکنان فقط با نام کاربری و رمز اختصاصی انجام می‌شود.");
      return;
    }
    if (loginMode === "key" && !key) {
      toast.error("کلید مدیریت را وارد کنید.");
      return;
    }
    if (loginMode === "account" && (!usernameInput.trim() || !passwordInput)) {
      toast.error("نام کاربری و رمز عبور را کامل وارد کنید.");
      return;
    }

    setLoadingList(true);
    try {
      const sessionResponse = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(
          loginMode === "key"
            ? { action: "login", adminKey: key }
            : { action: "login", username: usernameInput.trim(), password: passwordInput },
        ),
      });
      const sessionData = (await sessionResponse.json().catch(() => null)) as
        | { authenticated?: boolean; role?: AdminRole; statusMessage?: string; message?: string }
        | null;

      if (!sessionResponse.ok || !sessionData?.authenticated) {
        throw new Error(
          sessionData?.statusMessage ||
            sessionData?.message ||
            "ورود به پنل مدیریت انجام نشد.",
        );
      }

      const role = normalizeAdminRole(sessionData.role);
      if (staffMode && role !== "staff") {
        await fetch("/api/admin/session", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: "logout" }) }).catch(() => {});
        throw new Error("این حساب نقش کارمند ندارد؛ از حساب کارمند استفاده کنید.");
      }
      if (!staffMode && role === "staff") {
        window.location.replace("/staff");
        return;
      }
      let rows: Property[] = [];
      let totals: Awaited<ReturnType<typeof countAdminProperties>> | null = null;
      let filteredCount = 0;
      if (hasAdminPermission(role, "property.manage")) {
        const filterData = currentListFilters(0, 50);
        [rows, totals, filteredCount] = await Promise.all([
          listAdminProperties({ data: filterData }),
          countAdminProperties({ data: {} }),
          countFilteredAdminProperties({ data: filterData }),
        ]);
      }

      setKeyInput("");
      setPasswordInput("");
      setProperties(rows);
      setFilteredTotal(filteredCount);
      setPropertyHasMore(rows.length < filteredCount);
      setServerStats(totals);
      setAdminRole(role);
      setView(staffMode ? "staffHome" : "dashboard");
      setLoginNotice(null);
      setUnlocked(true);

      if (showToast) toast.success(staffMode ? "ورود به پنل کارکنان موفق بود." : "ورود به پنل مدیریت موفق بود.");
    } catch (error) {
      setUnlocked(false);
      toast.error(adminErrorMessage(error, loginMode === "key" ? "کلید مدیریت نادرست است." : "نام کاربری یا رمز عبور نادرست است."));
    } finally {
      setLoadingList(false);
    }
  }

  function logout() {
    void (async () => {
      if (view === "form" && formDirty) {
        const leave = await confirm({
          title: "خروج از پنل",
          description: "تغییرات ذخیره‌نشده این فرم پاک می‌شود. مطمئن هستید؟",
          confirmLabel: "بله، خارج شو",
          cancelLabel: "بمانم",
          tone: "danger",
        });
        if (!leave) return;
      }

      // Await the request: clearing local state before the cookie is dropped
      // leaves a window where a refresh would silently sign the admin back in.
      await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "logout" }),
      }).catch(() => {
        // Local state is still cleared even when the logout request fails.
      });

      clearDraft(draftKeyRef.current);
      setUnlocked(false);
      setAdminRole("owner");
      setKeyInput("");
      setUsernameInput("");
      setPasswordInput("");
      setProperties([]);
      setPropertyHasMore(false);
      setFilteredTotal(0);
      setServerStats(null);
      setForm(emptyForm());
      setSelectedIds([]);
      setFormDirty(false);
      setDraftRestored(null);
      setListError(null);
      setDrawerOpen(false);
      setView("dashboard");
    })();
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function toggleSelectAllVisible() {
    const visibleIds = filtered.map((item) => item.id);
    setSelectedIds((current) =>
      visibleIds.length > 0 && visibleIds.every((id) => current.includes(id))
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds])),
    );
  }

  async function exportProperties() {
    try {
      const response = await fetch("/api/admin/properties-export", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as
          | { statusMessage?: string; message?: string }
          | null;
        throw new Error(body?.statusMessage || body?.message || "خروجی فایل‌ها آماده نشد.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "hirmand-properties.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("خروجی کامل فایل‌ها دانلود شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خروجی گرفتن انجام نشد.");
    }
  }

  async function bulkSetStatus(status: PublishStatus) {
    if (!canManageProperties) {
      toast.error("دسترسی تغییر وضعیت فایل برای این حساب فعال نیست.");
      return;
    }
    if (status === "published" && !canPublishProperties) {
      toast.error("انتشار نهایی فایل فقط برای مدیران مجاز است.");
      return;
    }
    const ids = Array.from(new Set(selectedIds));
    if (!ids.length || bulkBusy) return;
    const selected = properties.filter((item) => ids.includes(item.id));
    const actionLabel = status === "published" ? "انتشار" : status === "draft" ? "بازگشت به پیش‌نویس" : "بایگانی";
    const ok = await confirm({
      title: "پیش‌نمایش عملیات گروهی · " + actionLabel,
      description: ids.length.toLocaleString("fa-IR") + " فایل انتخاب‌شده با عملیات «" + actionLabel + "» تغییر می‌کنند.",
      items: selected.map((item) => item.title),
      confirmLabel: "ادامه و اجرای عملیات",
      tone: status === "archived" ? "danger" : "default",
    });
    if (!ok) return;

    setBulkBusy(true);
    try {
      const result = await bulkUpdatePropertyStatus({ data: { ids, status } });
      setSelectedIds([]);
      await refresh();
      toast.success((result.updated || ids.length).toLocaleString("fa-IR") + " فایل به‌روزرسانی شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "عملیات گروهی کامل نشد.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkSetFeatured(featured: boolean) {
    if (!canManageProperties) {
      toast.error("دسترسی مدیریت فایل‌های ویژه برای این حساب فعال نیست.");
      return;
    }
    const ids = Array.from(new Set(selectedIds));
    if (!ids.length || bulkBusy) return;
    const selected = properties.filter((item) => ids.includes(item.id));
    const actionLabel = featured ? "ویژه کردن" : "حذف ویژه";
    const ok = await confirm({
      title: "پیش‌نمایش عملیات گروهی · " + actionLabel,
      description: ids.length.toLocaleString("fa-IR") + " فایل انتخاب‌شده با این عملیات تغییر می‌کنند.",
      items: selected.map((item) => item.title),
      confirmLabel: "ادامه و اجرای عملیات",
      tone: "default",
    });
    if (!ok) return;

    setBulkBusy(true);
    try {
      const result = await bulkSetPropertyFeatured({ data: { ids, featured } });
      setSelectedIds([]);
      await refresh();
      toast.success((result.updated || ids.length).toLocaleString("fa-IR") + (featured ? " فایل ویژه شد." : " فایل از حالت ویژه خارج شد."));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تغییر وضعیت ویژه انجام نشد.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkAssignConsultant(member: { name: string; phone: string }) {
    if (!canManageProperties) {
      toast.error("دسترسی تخصیص فایل به مشاور برای این حساب فعال نیست.");
      return;
    }
    const ids = Array.from(new Set(selectedIds));
    if (!ids.length || bulkBusy) return;
    const selected = properties.filter((item) => ids.includes(item.id));
    const ok = await confirm({
      title: "پیش‌نمایش تخصیص گروهی",
      description: ids.length.toLocaleString("fa-IR") + " فایل انتخاب‌شده به مشاور «" + member.name + "» واگذار می‌شوند.",
      items: selected.map((item) => item.title),
      confirmLabel: "تأیید تخصیص",
      tone: "default",
    });
    if (!ok) return;

    setBulkBusy(true);
    try {
      const result = await bulkAssignPropertyConsultant({
        data: { ids, contactName: member.name, contactPhone: member.phone },
      });
      setSelectedIds([]);
      await refresh();
      toast.success((result.updated || ids.length).toLocaleString("fa-IR") + " فایل به «" + member.name + "» واگذار شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تخصیص مشاور انجام نشد.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (!canManageProperties) {
      toast.error("دسترسی انتقال فایل به سطل بازیابی برای این حساب فعال نیست.");
      return;
    }
    const ids = Array.from(new Set(selectedIds));
    if (!ids.length || bulkBusy) return;

    const selected = properties.filter((item) => ids.includes(item.id));
    const ok = await confirm({
      title: "انتقال گروهی به سطل بازیابی",
      description: `${ids.length.toLocaleString("fa-IR")} فایل انتخاب‌شده به سطل بازیابی منتقل می‌شود. رسانه‌های آن‌ها حفظ می‌شود و بعداً امکان بازیابی یا حذف دائمی دارید.`,
      items: selected.map((item) => item.title),
      confirmLabel: "انتقال به سطل",
      tone: "danger",
    });
    if (!ok) return;

    setBulkBusy(true);
    try {
      const result = await bulkDeleteProperties({ data: { ids } });
      setSelectedIds([]);
      await refresh();
      toast.success((result.deleted || ids.length).toLocaleString("fa-IR") + " فایل به سطل بازیابی منتقل شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "حذف گروهی کامل نشد.");
    } finally {
      setBulkBusy(false);
    }
  }

  useEffect(() => {
    if (!unlocked || !canManageProperties) return;

    const timer = window.setTimeout(() => {
      const requestId = ++propertyRequestId.current;
      setSelectedIds([]);
      setLoadingList(true);
      setListError(null);

      const filterData = currentListFilters((page - 1) * pageSize, pageSize);
      void Promise.all([
        listAdminProperties({ data: filterData }),
        countFilteredAdminProperties({ data: filterData }),
      ])
        .then(([rows, filteredCount]) => {
          if (requestId !== propertyRequestId.current) return;
          setProperties(rows);
              setFilteredTotal(filteredCount);
          setPropertyHasMore(rows.length < filteredCount);
          const lastPage = Math.max(1, Math.ceil(filteredCount / pageSize));
          if (page > lastPage) setPage(lastPage);
        })
        .catch((error) => {
          if (requestId !== propertyRequestId.current) return;
          setListError(adminErrorMessage(error, "اعمال فیلترها انجام نشد."));
        })
        .finally(() => {
          if (requestId === propertyRequestId.current) setLoadingList(false);
        });
    }, 350);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    unlocked,
    canManageProperties,
    query,
    page,
    pageSize,
    listFilter,
    listTransaction,
    listType,
    listNeighborhood,
    listMedia,
    listPriceMin,
    listPriceMax,
    listAreaMin,
    listBedroomsMin,
    listSort,
  ]);

  // Any filter change invalidates the current page number; jumping back to
  // page 1 is what the user expects from a narrowed result set.
  useEffect(() => {
    setPage(1);
  }, [
    query,
    listFilter,
    listTransaction,
    listType,
    listNeighborhood,
    listMedia,
    listPriceMin,
    listPriceMax,
    listAreaMin,
    listBedroomsMin,
    listSort,
  ]);

  const filtered = properties;

  const stats = useMemo(() => {
    const published = properties.filter((p) => p.status === "published").length;
    const draft = properties.filter((p) => p.status === "draft").length;
    const archived = properties.filter((p) => p.status === "archived").length;
    const featured = properties.filter((p) => p.featured).length;

    return {
      total: serverStats?.total ?? filteredTotal,
      published: serverStats?.published ?? published,
      draft: serverStats?.draft ?? draft,
      archived: serverStats?.archived ?? archived,
      featured: serverStats?.featured ?? featured,
    };
  }, [properties, serverStats, filteredTotal]);



  async function requestPublication() {
    if (!form.id) {
      toast.error("ابتدا فایل را ذخیره کنید.");
      return;
    }
    const note = window.prompt("یادداشت برای مدیر تأییدکننده (اختیاری):", "");
    if (note === null) return;
    try {
      await requestPropertyPublication({ data: { propertyId: form.id, note } });
      toast.success("درخواست تأیید انتشار در صف مدیر ثبت شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "درخواست انتشار ثبت نشد.");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    // A ref guard, not just `disabled={saving}`: two clicks inside the same
    // render pass both see `saving === false`.
    if (submitting.current) return;
    if (!unlocked) {
      toast.error("ابتدا وارد پنل شوید.");
      return;
    }
    if (!form.title.trim()) {
      toast.error("عنوان فایل را وارد کنید.");
      return;
    }
    if (!form.neighborhood.trim()) {
      toast.error("محله را انتخاب یا وارد کنید.");
      return;
    }
    if (!form.contactName.trim() || !form.contactPhone.trim()) {
      toast.error("نام و تلفن مشاور را مشخص کنید.");
      return;
    }
    if (form.description.trim().length < 10) {
      toast.error("توضیحات فایل را کامل‌تر بنویسید.");
      return;
    }
    if ((form.latitude == null) !== (form.longitude == null)) {
      toast.error("برای موقعیت نقشه، هر دو مختصات عرض و طول را کامل کنید یا هر دو را پاک کنید.");
      return;
    }
    if ([form.price, form.deposit, form.rent].some(hasInvalidMoney)) {
      toast.error("مبلغ باید فقط شامل رقم باشد و حداکثر ۲۰ رقم داشته باشد.");
      return;
    }
    if (hasInvalidPropertyIntegerInputs(form)) {
      toast.error("متراژ، خواب، سرویس، طبقه، تعداد طبقات و سال ساخت باید عدد صحیح باشند.");
      return;
    }
    const price = moneyOrNull(form.price);
    const deposit = moneyOrNull(form.deposit);
    const rent = moneyOrNull(form.rent);
    if (form.transactionType === "sell" && price == null) {
      toast.error("برای فایل فروش، قیمت فروش را وارد کنید.");
      return;
    }
    if (form.transactionType === "rent" && deposit == null && rent == null) {
      toast.error("برای فایل اجاره حداقل یکی از رهن یا اجاره را وارد کنید.");
      return;
    }
    if (form.transactionType === "mortgage" && deposit == null) {
      toast.error("برای فایل رهن، مبلغ رهن را وارد کنید.");
      return;
    }

    if (form.status === "published") {
      const readiness = getPublishReadinessForForm(form);
      if (!readiness.ready) {
        toast.error("انتشار فایل متوقف شد: " + readiness.blockers.join(" "));
        return;
      }
    }

    const { valid: images, invalid } = parseImageUrls(form.images);
    if (invalid.length) {
      toast.error("برخی لینک‌های تصویر/ویدیو معتبر نیستند.");
      return;
    }

    setSaving(true);
    submitting.current = true;
    try {
      const result = await saveProperty({
        data: {
          id: form.id,
          title: form.title.trim(),
          transactionType: form.transactionType,
          propertyType: form.propertyType,
          neighborhood: form.neighborhood.trim(),
          address: staffMode ? undefined : form.address.trim() || undefined,
          areaM2: numberOrNull(form.areaM2),
          bedrooms: numberOrNull(form.bedrooms),
          bathrooms: numberOrNull(form.bathrooms),
          floor: form.floorLabel === "suite" ? null : numberOrNull(form.floor, true),
          floorLabel: form.floorLabel,
          orientation: form.orientation,
          totalFloors: numberOrNull(form.totalFloors),
          builtYear: numberOrNull(form.builtYear),
          parking: form.parking,
          elevator: form.elevator,
          storage: form.storage,
          painted: form.painted,
          wallpaper: form.wallpaper,
          convertible: form.convertible,
          cabinetType: form.cabinetType,
          flooringType: form.flooringType,
          coolingSystem: form.coolingSystem,
          heatingSystem: form.heatingSystem,
          wallClosetType: form.wallClosetType,
          otherAmenities: form.otherAmenities,
          price,
          deposit,
          rent,
          description: form.description.trim(),
          features: splitLines(form.features),
          images,
          floorPlanUrl: form.floorPlanUrl.trim(),
          contactName: form.contactName.trim(),
          contactPhone: form.contactPhone.trim(),
          ownerName: staffMode ? "" : form.ownerName.trim(),
          ownerPhone: staffMode ? "" : form.ownerPhone.trim(),
          ownerInfo: staffMode ? "" : form.ownerInfo.trim(),
          latitude: form.latitude,
          longitude: form.longitude,
          virtualTourUrl: form.virtualTourUrl.trim(),
          status: staffMode ? "draft" : form.status,
          availabilityStatus: form.availabilityStatus,
          internalPriority: form.internalPriority,
          internalNote: form.internalNote.trim(),
          featured: staffMode ? false : form.featured,
          featuredUntil: staffMode ? null : form.featuredUntil
            ? (() => {
                const date = new Date(form.featuredUntil);
                if (!Number.isFinite(date.getTime())) throw new Error("تاریخ پایان ویژه نامعتبر است.");
                return date.toISOString();
              })()
            : null,
        },
      });
      if (staffMode) {
        toast.success("فایل به‌صورت پیش‌نویس ثبت شد؛ انتشار آن به تأیید مدیر نیاز دارد.");
        clearDraft(draftKeyRef.current);
        setForm(emptyForm());
        setFormDirty(false);
        setDraftRestored(null);
        setChangeHistory([]);
        setView("staffHome");
        return;
      }
      toast.success(form.id ? "فایل به‌روزرسانی شد." : "فایل جدید ذخیره شد.");
      clearDraft(draftKeyRef.current);
      setForm(propertyToForm(result));
      setFormDirty(false);
      setDraftRestored(null);
      const history = await listPropertyChangeHistory({ data: { id: result.id, limit: 10 } }).catch(() => []);
      setChangeHistory(history);
      await refresh();
      setView("list");
    } catch (error) {
      toast.error(adminErrorMessage(error, "ذخیره انجام نشد. دوباره تلاش کنید."));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  function loadHistoryVersion(item: (typeof changeHistory)[number]) {
    if (!item.beforeState || typeof item.beforeState !== "object") { toast.error("نسخه قابل بازیابی برای این رویداد در دسترس نیست."); return; }
    const snapshot = item.beforeState as Partial<Property>;
    if (typeof snapshot.title !== "string" || typeof snapshot.transactionType !== "string") { toast.error("اطلاعات نسخه قبلی کامل نیست."); return; }
    setForm(propertyToForm(snapshot as Property)); setFormDirty(true); setDraftRestored(null);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    toast.success("نسخه قبلی داخل فرم بارگذاری شد؛ برای اعمال نهایی، «ذخیره» را بزنید.");
  }

  const submitGuardReady = async (message: string) =>
    confirm({
      title: "تغییرات ذخیره نشده دارید",
      description: `${message} اگر ادامه دهید، تغییرات ذخیره‌نشده از بین می‌رود.`,
      confirmLabel: "بله، ادامه بده",
      cancelLabel: "بمانم",
      tone: "danger",
    });

  function startNew() {
    if (!canCreateProperties) {
      toast.error("دسترسی ایجاد فایل ملک برای این حساب فعال نیست.");
      return;
    }
    void (async () => {
      if (view === "form" && formDirty && !(await submitGuardReady("فایل جدید را باز می‌کنید."))) return;
      clearDraft(draftKeyRef.current);
      setForm(emptyForm());
      setChangeHistory([]);
      setFormDirty(false);
      setDraftRestored(null);
      // Every path into the form closes the nav drawer, the same way
      // navigateTo does — otherwise "فایل جدید" from the drawer leaves the
      // drawer open on top of the form it just opened.
      setDrawerOpen(false);
      setView("form");
    })();
  }

  function editProperty(property: Property) {
    if (!canManageProperties) {
      toast.error("دسترسی ویرایش فایل ملک برای این حساب فعال نیست.");
      return;
    }
    void (async () => {
      if (view === "form" && formDirty && !(await submitGuardReady("فایل دیگری را ویرایش می‌کنید."))) return;
      clearDraft(draftKeyRef.current);
      setForm(propertyToForm(property));
      setFormDirty(false);
      setDraftRestored(null);
      setDrawerOpen(false);
      setView("form");
    })();
  }

  function duplicateProperty(property: Property) {
    if (!canManageProperties) {
      toast.error("دسترسی کپی فایل ملک برای این حساب فعال نیست.");
      return;
    }
    void (async () => {
      if (view === "form" && formDirty && !(await submitGuardReady("فایل را با یک کپی جدید جایگزین می‌کنید."))) return;
      clearDraft(draftKeyRef.current);
      const base = propertyToForm(property);
      setForm({
        ...base,
        id: undefined,
        title: `${base.title} (کپی)`,
        status: "draft",
        availabilityStatus: "available",
        featured: false,
        featuredUntil: "",
      });
      setFormDirty(false);
      setDraftRestored(null);
      setDrawerOpen(false);
      setView("form");
    })();
  }

  async function quickSetStatus(property: Property, status: PublishStatus) {
    if (!canManageProperties) {
      toast.error("دسترسی تغییر وضعیت فایل برای این حساب فعال نیست.");
      return;
    }
    if (status === "published" && !canPublishProperties) {
      toast.error("انتشار نهایی فایل فقط برای مدیران مجاز است.");
      return;
    }
    if (status === "archived") {
      const ok = await confirm({
        title: "بایگانی فایل",
        description: `فایل «${property.title}» از صفحه عمومی حذف و بایگانی می‌شود.`,
        confirmLabel: "بله، بایگانی کن",
        tone: "danger",
      });
      if (!ok) return;
    }
    if (busyRowId) return;
    setBusyRowId(property.id);
    try {
      const base = propertyToForm(property);
      if ([base.price, base.deposit, base.rent].some(hasInvalidMoney)) {
        throw new Error("مبلغ ذخیره‌شده برای این فایل نامعتبر است؛ ابتدا آن را اصلاح کنید.");
      }
      if (hasInvalidPropertyIntegerInputs(base)) {
        throw new Error("یکی از مقادیر عددی ذخیره‌شده برای این فایل نامعتبر است؛ ابتدا آن را اصلاح کنید.");
      }
      const result = await saveProperty({
        data: {
          id: base.id,
          title: base.title,
          transactionType: base.transactionType,
          propertyType: base.propertyType,
          neighborhood: base.neighborhood,
          address: base.address || undefined,
          areaM2: numberOrNull(base.areaM2),
          bedrooms: numberOrNull(base.bedrooms),
          bathrooms: numberOrNull(base.bathrooms),
          floor: base.floorLabel === "suite" ? null : numberOrNull(base.floor, true),
          floorLabel: base.floorLabel,
          orientation: base.orientation,
          totalFloors: numberOrNull(base.totalFloors),
          builtYear: numberOrNull(base.builtYear),
          parking: base.parking,
          elevator: base.elevator,
          storage: base.storage,
          painted: base.painted,
          wallpaper: base.wallpaper,
          convertible: base.convertible,
          cabinetType: base.cabinetType,
          flooringType: base.flooringType,
          coolingSystem: base.coolingSystem,
          heatingSystem: base.heatingSystem,
          wallClosetType: base.wallClosetType,
          otherAmenities: base.otherAmenities,
          price: moneyOrNull(base.price),
          deposit: moneyOrNull(base.deposit),
          rent: moneyOrNull(base.rent),
          description: base.description,
          features: splitLines(base.features),
          images: parseImageUrls(base.images).valid,
          floorPlanUrl: base.floorPlanUrl.trim(),
          contactName: base.contactName,
          contactPhone: base.contactPhone,
          ownerName: base.ownerName.trim(),
          ownerPhone: base.ownerPhone.trim(),
          ownerInfo: base.ownerInfo.trim(),
          latitude: base.latitude,
          longitude: base.longitude,
          virtualTourUrl: base.virtualTourUrl.trim(),
          status,
          availabilityStatus: base.availabilityStatus,
          featured: base.featured,
          featuredUntil: base.featuredUntil
            ? (() => {
                const date = new Date(base.featuredUntil);
                if (!Number.isFinite(date.getTime())) throw new Error("تاریخ پایان ویژه نامعتبر است.");
                return date.toISOString();
              })()
            : null,
        },
      });
      setProperties((current) => current.map((item) => item.id === result.id ? result : item));
      toast.success(status === "published" ? "فایل فوراً منتشر شد." : "فایل بایگانی شد.");
      await refresh();
    } catch (error) {
      toast.error(adminErrorMessage(error, "تغییر وضعیت انجام نشد."));
    } finally {
      setBusyRowId(null);
    }
  }

  async function removeProperty(property: Property) {
    const ok = await confirm({
      title: "حذف فایل",
      description: `فایل «${property.title}» به سطل بازیابی منتقل می‌شود و رسانه‌هایش حفظ می‌شوند. در صورت نیاز بعداً می‌توانید آن را بازیابی یا برای همیشه حذف کنید.`,
      confirmLabel: "انتقال به سطل",
      tone: "danger",
    });
    if (!ok) return;
    if (busyRowId) return;
    setBusyRowId(property.id);
    try {
      await deleteProperty({ data: { id: property.id } });
      toast.success("فایل به سطل بازیابی منتقل شد.");
      if (form.id === property.id) {
        clearDraft(property.id);
        setForm(emptyForm());
      }
      await refresh();
    } catch (error) {
      toast.error(adminErrorMessage(error, "حذف انجام نشد."));
    } finally {
      setBusyRowId(null);
    }
  }

  if (sessionChecking) {
    return (
      <div className="admin-login">
        <Toaster position="top-center" dir="rtl" richColors closeButton />
        <style dangerouslySetInnerHTML={{ __html: ADMIN_CSS }} />
        <div className="admin-login-card">
          <span className="kicker">پنل داخلی هیرمند</span>
          <h1>{staffMode ? "در حال بررسی نشست کارمند" : "در حال بررسی نشست"}</h1>
          <p>{staffMode ? "اعتبار حساب کارکنان بررسی می‌شود…" : "اعتبار نشست مدیریت بررسی می‌شود…"}</p>
          <div style={{ display: "grid", gap: 10, marginTop: 20 }} aria-hidden="true">
            <span className="admin-skeleton admin-skeleton-line" style={{ width: "100%", height: 14 }} />
            <span className="admin-skeleton admin-skeleton-line" style={{ width: "70%", height: 14 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="admin-login">
        <Toaster position="top-center" dir="rtl" richColors closeButton />
        <style dangerouslySetInnerHTML={{ __html: ADMIN_CSS }} />
        <div className="admin-login-card">
          <span className="kicker">پنل داخلی هیرمند</span>
          <h1>{staffMode ? "ورود کارکنان هیرمند" : "ورود به مدیریت"}</h1>
          <p>
      {staffMode ? "ورود با حساب کاربری اختصاصی کارکنان." : loginMode === "key" ? "ورود سریع با کلید اصلی مدیریت." : "با حساب اختصاصی مدیر وارد شوید تا سطح دسترسی شما دقیقاً اعمال شود."}
          </p>
          {!staffMode ? <div className="admin-login-switch" role="tablist" aria-label="روش ورود">
            <button type="button" className={loginMode === "key" ? "is-active" : ""} onClick={() => setLoginMode("key")}>کلید اصلی</button>
            <button type="button" className={loginMode === "account" ? "is-active" : ""} onClick={() => setLoginMode("account")}>حساب مدیر</button>
          </div> : null}
          {loginNotice ? <div className="admin-error-banner" role="alert" style={{ marginBottom: 12 }}>{loginNotice}</div> : null}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void unlock();
            }}
          >
            {loginMode === "key" ? (
              <label className="field" style={{ marginBottom: 12 }}>
                <span>کلید مدیریت</span>
                <input
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="••••••••••"
                />
              </label>
            ) : (
              <>
                <label className="field" style={{ marginBottom: 12 }}>
                  <span>نام کاربری</span>
                  <input dir="ltr" autoComplete="username" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="operator01" />
                </label>
                <label className="field" style={{ marginBottom: 12 }}>
                  <span>رمز عبور</span>
                  <input type="password" dir="ltr" autoComplete="current-password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="••••••••••" />
                </label>
              </>
            )}
            <button
              type="submit"
              className="btn-gold"
              style={{ width: "100%" }}
              disabled={loadingList || (loginMode === "key" ? !keyInput.trim() : !usernameInput.trim() || !passwordInput)}
            >
              {loadingList ? <RefreshCw size={16} className="admin-spin" /> : <KeyRound size={16} />}
              {loadingList ? "در حال بررسی…" : "ورود"}
            </button>
          </form>
          <p style={{ marginTop: 14, fontSize: ".78rem" }}>
            {staffMode ? "اطلاعات ورود را از مدیر هیرمند دریافت کنید. ساخت و مدیریت حساب کارکنان فقط در اختیار مدیر است." : "برای ساخت اولین حساب مستقل، با کلید اصلی وارد شوید و از «امنیت مدیران» یک حساب بسازید."}
          </p>
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <Link to="/" className="btn-ghost">
              بازگشت به سایت
            </Link>
          </div>
        </div>
      </div>
    );
  }

  function renderSidebarBody(extra?: React.ReactNode) {
    return (
      <>
        <div className="admin-sidebar-brand">
          <div className="admin-brand-icon" aria-hidden="true">
            <Building2 size={21} />
          </div>
          <div className="admin-brand-copy">
            <strong>هیرمند</strong>
            <small>{staffMode ? "پنل کارکنان" : "پنل مدیریت"}</small>
          </div>
          <div className="admin-brand-extra">{extra}</div>
        </div>
        <nav className="admin-sidebar-nav" aria-label="ناوبری اصلی مدیریت">
          <div className="admin-nav-intro">
            <span className="admin-nav-intro-kicker">{staffMode ? "فضای کارکنان" : "مرکز کنترل"}</span>
            <span className="admin-nav-intro-line" aria-hidden="true" />
          </div>

          {canCreateProperties ? (
            <button
              type="button"
              className={"admin-nav-btn admin-nav-btn-create" + (view === "form" && !form.id ? " is-active" : "")}
              onClick={startNew}
            >
              <span className="admin-nav-btn-icon" aria-hidden="true"><Plus size={18} /></span>
              <span className="admin-nav-btn-label">فایل جدید</span>
              <span className="admin-nav-btn-meta">+ افزودن</span>
            </button>
          ) : null}

          {canManageProperties && form.id ? (
            <button
              type="button"
              className={"admin-nav-btn admin-nav-btn-context" + (view === "form" ? " is-active" : "")}
              onClick={() => navigateTo("form")}
            >
              <span className="admin-nav-btn-icon" aria-hidden="true"><FileEdit size={18} /></span>
              <span className="admin-nav-btn-label">ویرایش فایل</span>
              <span className="admin-nav-btn-context-title">{form.title.slice(0, 18) || "فایل فعلی"}</span>
            </button>
          ) : null}

          {(() => {
            let previousSection = "";
            return visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = view === item.view;
              const showSection = item.section !== previousSection;
              previousSection = item.section;
              return (
                <Fragment key={item.view}>
                  {showSection ? (
                    <div className="admin-nav-section-label">
                      <span>{item.section}</span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={"admin-nav-btn" + (active ? " is-active" : "")}
                    aria-current={active ? "page" : undefined}
                    onClick={() => navigateTo(item.view)}
                  >
                    <span className="admin-nav-btn-icon" aria-hidden="true"><Icon size={18} /></span>
                    <span className="admin-nav-btn-label">{item.label}</span>
                  </button>
                  {item.view === "integrity" ? (
                    <a
                      href="/admin-mobile-management"
                      className="admin-nav-btn"
                      style={{ textDecoration: "none" }}
                    >
                      <span className="admin-nav-btn-icon" aria-hidden="true"><Smartphone size={18} /></span>
                      <span className="admin-nav-btn-label">مدیریت تلفن همراه</span>
                    </a>
                  ) : null}
                </Fragment>
              );
            });
          })()}
        </nav>
        <div className="admin-sidebar-foot">
          <div className="admin-sidebar-foot-label">اقدامات سریع</div>
          {canManageProperties ? (
            <button
              type="button"
              className="admin-nav-btn"
              onClick={() => void refresh()}
              disabled={loadingList}
            >
              <span className="admin-nav-btn-icon" aria-hidden="true">
                <RefreshCw size={18} className={loadingList ? "admin-spin" : undefined} />
              </span>
              <span className="admin-nav-btn-label">به‌روزرسانی</span>
            </button>
          ) : null}
          <Link to="/" className="admin-nav-btn">
            <span className="admin-nav-btn-icon" aria-hidden="true"><Home size={18} /></span>
            <span className="admin-nav-btn-label">مشاهده سایت</span>
          </Link>
          <button type="button" className="admin-nav-btn" onClick={logout}>
            <span className="admin-nav-btn-icon" aria-hidden="true"><LogOut size={18} /></span>
            <span className="admin-nav-btn-label">خروج از پنل</span>
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="admin-app">
      <Toaster position="top-center" dir="rtl" richColors closeButton />
      <style dangerouslySetInnerHTML={{ __html: ADMIN_CSS }} />
      {confirmDialog}
      <aside className="admin-sidebar">{renderSidebarBody()}</aside>

      {drawerOpen ? (
        <>
          <div
            className="admin-drawer-overlay"
            role="presentation"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            className="admin-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="ناوبری مدیریت"
          >
            {renderSidebarBody(
              <button
                type="button"
                className="admin-icon-btn"
                style={{ marginInlineStart: "auto" }}
                onClick={closeDrawer}
                aria-label="بستن منو"
              >
                <X size={16} />
              </button>,
            )}
          </div>
        </>
      ) : null}

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            type="button"
            className="admin-drawer-trigger"
            ref={drawerTriggerRef}
            onClick={() => setDrawerOpen(true)}
            aria-label="باز کردن منوی مدیریت"
            aria-expanded={drawerOpen}
          >
            <Menu size={20} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1>
              {view === "staffHome" && staffMode
                ? "فضای کاری کارکنان"
                : view === "dashboard"
                ? "داشبورد مدیریت"
                : view === "productivity"
                  ? "مرکز مدیریت"
                  : view === "list"
                  ? "فهرست فایل‌ها"
                  : view === "music"
                    ? "موسیقی سایت"
                    : view === "leads"
                      ? "درخواست‌های مشتری"
                      : view === "messages"
                        ? "گفت‌وگوی مشتری"
                      : view === "partners"
                        ? "باشگاه همکاران و کد رهگیری"
                        : view === "consultants"
                          ? "مشاورین و اعضای بنگاه"
                          : view === "attendance"
                            ? "ساعت ورود و خروج"
                            : view === "matching"
                              ? "مچ کردن درخواست‌ها"
                              : view === "owners"
                                ? "مالکین و سبد فایل‌ها"
                                : view === "finance"
                                  ? "دفتر مالی و تسویه"
                                  : view === "integrity"
                                    ? "اسکن خطاها و ناسازگاری‌های اطلاعاتی"
                                    : view === "deals"
                                      ? "ثبت معامله، کمیسیون و کنترل مدارک قرارداد"
                                      : view === "expiry"
                                        ? "فایل‌های منقضی، نزدیک به انقضا و قدیمی را کنترل کنید"
                                        : view === "backup"
                                    ? "پشتیبان‌گیری"
                                    : view === "watermark"
                                      ? "واترمارک تصاویر و فیلم‌ها"
                                      : view === "schedule"
                                        ? "زمان‌بندی انتشار و انقضای فایل‌ها"
                                        : view === "trash"
                                          ? "سطل بازیابی فایل‌ها"
                                          : view === "audit"
                                            ? "گزارش فعالیت مدیر"
                                            : view === "settings"
                                              ? "تنظیمات سایت و SEO"
                                              : view === "mediaHealth"
                                                ? "سلامت و پاک‌سازی رسانه‌ها"
                                                : view === "security"
                                                  ? "امنیت مدیران"
                                                  : view === "seoRedirects"
                                                    ? "ریدایرکت و ۴۰۴"
                                                    : view === "contentStudio"
                                                      ? "استودیو محتوا"
                                                      : (view as string) === "integrity"
                                                        ? "سلامت داده و کنترل کیفیت"
                                                        : (view as string) === "deals"
                                                          ? "معاملات و قراردادها"
                                                          : (view as string) === "expiry"
                                                            ? "انقضا و تمدید فایل‌ها"
                                                            : view === "commission"
                                                              ? "تسویه کمیسیون مشاوران"
                                                               : view === "consultantPerformance"
                                                                ? "عملکرد و بازدهی مشاوران"
                                                              : view === "consultantTargets"
                                                                ? "اهداف و سهمیه ماهانه مشاوران"
                                                              : view === "managementReport"
                                                                ? "گزارش مدیریتی و خروجی عملکرد"
                                                              : view === "divar"
                                                        ? "فایل‌های دیوار"
                          : form.id
                        ? "ویرایش فایل"
                        : "افزودن فایل جدید"}            </h1>
            <p>
              {view === "staffHome" && staffMode
                ? "افزودن فایل، بررسی درخواست‌ها، تطبیق ملک‌ها و دریافت آگهی از دیوار"
                : view === "dashboard"
                ? "نمای کلی فایل‌ها، ورودی مشتری و وضعیت پیگیری"
                : view === "productivity"
                  ? "وظایف، تقویم کاری، هشدارها، سلامت فایل‌ها و فید فعالیت‌ها"
                  : view === "list"
                  ? `${stats.total.toLocaleString("fa-IR")} فایل در سیستم`
                  : view === "leads"
                    ? "مدیریت Leadها و پیگیری مشتریان"
                    : view === "messages"
                      ? "پاسخ‌گویی مستقیم به مشتریانی که از طریق کد رهگیری پیام داده‌اند"
                    : view === "attendance"
                      ? "ثبت حضور اعضای بنگاه و گزارش ساعت‌های ورود و خروج"
                      : view === "matching"
                        ? "تطبیق درخواست‌های مشتری با فایل‌های منتشرشده سایت"
                        : view === "owners"
                          ? "فهرست مالکین و همه فایل‌های وابسته"
                          : view === "finance"
                            ? "ثبت درآمد و هزینه‌های دفتر"
                            : view === "consultantPerformance"
                              ? "نرخ تبدیل، معاملات، حجم فروش و وضعیت کمیسیون مشاوران"
                            : view === "managementReport"
                              ? "گزارش دوره‌ای فایل‌ها، CRM، معاملات و وضعیت مالی"
                            : view === "backup"
                              ? "دانلود نسخه امن از اطلاعات مدیریتی"
                              : view === "watermark"
                                ? "لوگو، نام سایت، شفافیت و اندازه واترمارک رسانه"
                                : view === "schedule"
                                  ? "شروع و پایان نمایش عمومی فایل‌ها را از قبل تعیین کنید"
                                  : view === "trash"
                                    ? "فایل‌های حذف‌شده را بازیابی یا برای همیشه پاک کنید"
                                    : view === "audit"
                                      ? "ردیابی عملیات مهم مدیریتی و تغییرات اخیر"
                                      : view === "settings"
                                        ? "کنترل اطلاعات تماس، شبکه‌های اجتماعی، SEO و اعلان سایت"
                                        : view === "mediaHealth"
                                          ? "بررسی مصرف دیتابیس رسانه، رسانه‌های یتیم و آپلودهای نیمه‌کاره"
                                            : view === "security"
                                              ? "مدیریت نشست‌های فعال و کنترل دسترسی مدیران"
                                              : view === "seoRedirects"
                                                ? "مدیریت ریدایرکت‌های دائمی/موقت و گزارش خطاهای ۴۰۴"
                                                : view === "contentStudio"
                                                  ? "ویرایش راهنماها و پرسش‌های متداول بدون تغییر کد"
                              : view === "divar"
                        ? "دریافت، فیلتر و ورود فایل‌های شخصی از دیوار"
                        : form.contactName
                    ? `مشاور مسئول: ${form.contactName}${formDirty ? " · تغییرات ذخیره‌نشده" : ""}`
                    : "مشاور مسئول را انتخاب کنید"}            </p>
          </div>
          <div className="admin-topbar-actions">
            <span className="admin-role-chip" title="سطح دسترسی حساب فعلی">{ADMIN_ROLE_LABELS[adminRole]}</span>
            <AdminCommandPalette
              items={visibleNavItems.map((item) => ({ id: item.view, label: item.label }))}
              onSelect={(id) => navigateTo(id as ViewMode)}
              onNewProperty={canCreateProperties ? startNew : undefined}
              onRefresh={canManageProperties ? () => void refresh() : undefined}
            />
            {view === "dashboard" || view === "list" || (staffMode && view === "staffHome") ? (
              canCreateProperties ? (
                <button type="button" className="btn-gold" onClick={startNew}>
                  <Plus size={16} />
                  فایل جدید
                </button>
              ) : null
            ) : (
              <button type="button" className="btn-ghost" onClick={() => navigateTo(view === "form" ? (staffMode ? "staffHome" : "list") : (staffMode ? "staffHome" : "dashboard"))}>
                <X size={16} />
                بستن
              </button>
            )}
          </div>
        </header>

        <div className="admin-content">
          {view === "staffHome" && staffMode ? (
            <section className="admin-panel" style={{ marginBottom: 16 }}>
              <div className="admin-panel-head">
                <div>
                  <span className="kicker">میز کار تیم</span>
                  <h2>امروز از اینجا شروع کنید</h2>
                  <p className="admin-dashboard-summary">فقط ابزارهای روزمره در دسترس شماست. فایل‌هایی که اضافه می‌کنید تا تأیید مدیر پیش‌نویس می‌مانند.</p>
                </div>
              </div>
              <div className="admin-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
                <button type="button" className="admin-stat-card" onClick={startNew}>
                  <span><Plus size={18} /> افزودن فایل جدید</span>
                  <strong>ثبت مشخصات ملک</strong>
                </button>
                <button type="button" className="admin-stat-card" onClick={() => navigateTo("leads")}>
                  <span><UsersRound size={18} /> درخواست‌های مشتری</span>
                  <strong>بررسی و پیگیری</strong>
                </button>
                <button type="button" className="admin-stat-card" onClick={() => navigateTo("matching")}>
                  <span><GitCompareArrows size={18} /> مچ کردن فایل‌ها</span>
                  <strong>تطبیق با درخواست</strong>
                </button>
                <button type="button" className="admin-stat-card" onClick={() => navigateTo("divar")}>
                  <span><Globe2 size={18} /> دریافت از دیوار</span>
                  <strong>ورود آگهی به پیش‌نویس</strong>
                </button>
              </div>
              <p style={{ margin: "16px 0 0", color: "var(--navy-700, #536575)" }}>
                انتشار نهایی، ویرایش فایل‌های ثبت‌شده، حذف اطلاعات و تنظیمات سایت در اختیار مدیر باقی می‌ماند.
              </p>
            </section>
          ) : null}

          {view === "dashboard" ? (
            <>
              <AdminKpiHistory />
              <AdminSalesFunnel />
              {canPublishProperties ? <AdminPublicationQueue /> : null}
              {canManageLeads ? (
                <AdminOperationsCenter
                  onOpenLeads={() => navigateTo("leads")}
                  onOpenMatching={() => navigateTo("matching")}
                  onOpenProperties={() => navigateTo("list")}
                  onOpenFinance={() => navigateTo("finance")}
                  showFinance={canManageFinance}
                />
              ) : null}
              <AdminDashboard
                role={adminRole}
                onOpenProperties={() => navigateTo("list")}
                onOpenLeads={() => navigateTo("leads")}
                onOpenProductivity={() => navigateTo("productivity")}
                onCreateProperty={startNew}
                onOpenDivar={() => navigateTo("divar")}
                onOpenConsultants={() => navigateTo("consultants")}
                onOpenPartners={() => navigateTo("partners")}
                onOpenAttendance={() => navigateTo("attendance")}
                onOpenMusic={() => navigateTo("music")}
              />
            </>
          ) : view === "managementReport" ? (
            <AdminManagementReport role={adminRole} />
          ) : (view as string) === "integrity" ? (
            <AdminDataHealth />
          ) : view === "deals" ? (
            <AdminDealsManager />
          ) : view === "expiry" ? (
            <AdminPropertyExpiryCenter />
          ) : view === "productivity" ? (
            <AdminProductivityCenter />
          ) : null}

          {view === "list" ? (
            <>
              <div className="admin-stats-grid">
                {(
                  [
                    { key: "all" as const, label: "همه", value: stats.total, tone: undefined },
                    { key: "published" as const, label: "منتشرشده", value: stats.published, tone: "green" as const },
                    { key: "draft" as const, label: "پیش‌نویس", value: stats.draft, tone: "amber" as const },
                    { key: "archived" as const, label: "بایگانی", value: stats.archived, tone: "muted" as const },
                    { key: "featured" as const, label: "ویژه", value: stats.featured, tone: "gold" as const },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`admin-stat-card${listFilter === item.key ? " is-active" : ""}`}
                    data-tone={item.tone}
                    onClick={() => setListFilter(item.key)}
                  >
                    <span>{item.label}</span>
                    <strong>{item.value.toLocaleString("fa-IR")}</strong>
                  </button>
                ))}
              </div>

              <section className="admin-panel">
                <div className="admin-panel-head">
                  <div>
                    <span className="kicker">فایل‌ها</span>
                    <h2>{fa(filteredTotal)} مورد مطابق فیلتر</h2>
                  </div>
                  <div className="admin-list-toolbar" style={{ width: "100%" }}>
                    <label className="admin-search" style={{ flex: 1 }}>
                      <Search size={16} aria-hidden="true" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="جستجو بر اساس کد فایل، عنوان، محله، مشاور، مالک یا تلفن…"
                        aria-label="جستجوی فایل‌ها"
                      />
                    </label>
                    <button type="button" className="btn-ghost" onClick={clearAllFilters} disabled={!activeFilterChips.length && !query}>
                      <Filter size={15} /> پاک‌سازی فیلتر
                    </button>
                  </div>
                  <AdminPropertyFilterPresets
                    state={{
                      query,
                      listFilter,
                      listTransaction,
                      listType,
                      listNeighborhood,
                      listSort,
                      listMedia,
                      listPriceMin,
                      listPriceMax,
                      listAreaMin,
                      listBedroomsMin,
                    }}
                    onApply={(preset) => {
                      setQuery(preset.query);
                      setListFilter(preset.listFilter as typeof listFilter);
                      setListTransaction(preset.listTransaction as typeof listTransaction);
                      setListType(preset.listType as typeof listType);
                      setListNeighborhood(preset.listNeighborhood);
                      setListSort(preset.listSort as typeof listSort);
                      setListMedia(preset.listMedia as MediaFilter);
                      setListPriceMin(preset.listPriceMin);
                      setListPriceMax(preset.listPriceMax);
                      setListAreaMin(preset.listAreaMin);
                      setListBedroomsMin(preset.listBedroomsMin);
                      setPage(1);
                    }}
                  />
                  <div className="admin-filter-row">
                    <select value={listTransaction} onChange={(e) => setListTransaction(e.target.value as typeof listTransaction)} aria-label="فیلتر معامله">
                      <option value="all">همه معاملات</option>
                      {TX_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                    <select value={listType} onChange={(e) => setListType(e.target.value as typeof listType)} aria-label="فیلتر نوع ملک">
                      <option value="all">همه انواع ملک</option>
                      {PROPERTY_TYPES.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                    </select>
                    <select value={listNeighborhood} onChange={(e) => setListNeighborhood(e.target.value)} aria-label="فیلتر محله">
                      <option value="">همه محله‌ها</option>
                      {neighborhoodOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                    <select value={listMedia} onChange={(e) => setListMedia(e.target.value as MediaFilter)} aria-label="فیلتر تصویر">
                      <option value="all">همه (تصویر و بدون تصویر)</option>
                      <option value="with">دارای تصویر</option>
                      <option value="without">بدون تصویر</option>
                    </select>
                    <label className="admin-search" style={{ minWidth: 130 }}>
                      <span className="sr-only">حداقل قیمت (تومان)</span>
                      <input
                        inputMode="numeric"
                        value={listPriceMin}
                        onChange={(e) => setListPriceMin(e.target.value)}
                        placeholder="قیمت از"
                        aria-label="حداقل قیمت به تومان"
                      />
                    </label>
                    <label className="admin-search" style={{ minWidth: 130 }}>
                      <span className="sr-only">حداکثر قیمت (تومان)</span>
                      <input
                        inputMode="numeric"
                        value={listPriceMax}
                        onChange={(e) => setListPriceMax(e.target.value)}
                        placeholder="قیمت تا"
                        aria-label="حداکثر قیمت به تومان"
                      />
                    </label>
                    <label className="admin-search" style={{ minWidth: 120 }}>
                      <span className="sr-only">حداقل متراژ</span>
                      <input
                        inputMode="numeric"
                        value={listAreaMin}
                        onChange={(e) => setListAreaMin(e.target.value)}
                        placeholder="متراژ از"
                        aria-label="حداقل متراژ"
                      />
                    </label>
                    <label className="admin-search" style={{ minWidth: 110 }}>
                      <span className="sr-only">حداقل تعداد خواب</span>
                      <input
                        inputMode="numeric"
                        value={listBedroomsMin}
                        onChange={(e) => setListBedroomsMin(e.target.value)}
                        placeholder="خواب از"
                        aria-label="حداقل تعداد خواب"
                      />
                    </label>
                    <select value={listSort} onChange={(e) => setListSort(e.target.value as ListSort)} aria-label="مرتب‌سازی">
                      {LIST_SORT_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                    <div className="admin-results-meta">
                      <ArrowUpDown size={14} aria-hidden="true" />
                      {fa(filtered.length)} مورد در این صفحه
                    </div>
                  </div>
                  {activeFilterChips.length ? (
                    <div className="admin-filter-chips" style={{ marginTop: 10 }}>
                      {activeFilterChips.map((chip) => (
                        <span key={chip.key} className="admin-filter-chip">
                          {chip.label}
                          <button type="button" onClick={chip.clear} aria-label={`حذف فیلتر ${chip.label}`}>
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="admin-list-toolbar" style={{ marginTop: 10, justifyContent: "space-between" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={toggleSelectAllVisible}
                        disabled={filtered.length === 0}
                      >
                        <CheckSquare size={15} />
                        {filtered.length > 0 && filtered.every((item) => selectedIds.includes(item.id)) ? "لغو انتخاب این صفحه" : "انتخاب این صفحه"}
                      </button>
                    </div>
                    <button type="button" className="btn-ghost" onClick={() => void exportProperties()}>
                      <Download size={15} /> خروجی کامل CSV
                    </button>
                  </div>
                </div>

                {listError ? (
                  <div style={{ padding: "14px 20px" }}>
                    <AdminErrorBanner
                      message={listError}
                      onRetry={() => void refresh()}
                      onDismiss={() => setListError(null)}
                    />
                  </div>
                ) : null}

                {selectedIds.length > 0 ? (
                  <div className="admin-bulk-bar">
                    <strong>{fa(selectedIds.length)} فایل انتخاب شده</strong>
                    <button type="button" className="btn-ghost" disabled={bulkBusy} onClick={() => void bulkSetStatus("published")}>انتشار</button>
                    <button type="button" className="btn-ghost" disabled={bulkBusy} onClick={() => void bulkSetStatus("draft")}>پیش‌نویس</button>
                    <button type="button" className="btn-ghost" disabled={bulkBusy} onClick={() => void bulkSetStatus("archived")}>بایگانی</button>
                    <button type="button" className="btn-ghost" disabled={bulkBusy} onClick={() => void bulkSetFeatured(true)}><Star size={15} /> ویژه</button>
                    <button type="button" className="btn-ghost" disabled={bulkBusy} onClick={() => void bulkSetFeatured(false)}>حذف ویژه</button>
                    {assignmentConsultants.some((member) => member.isActive) ? (
                      <select
                        className="admin-lead-status-select"
                        disabled={bulkBusy}
                        defaultValue=""
                        aria-label="تخصیص مشاور به فایل‌های انتخاب‌شده"
                        onChange={(e) => {
                          const member = assignmentConsultants.find((item) => item.phone === e.target.value);
                          if (member) void bulkAssignConsultant(member);
                          e.currentTarget.value = "";
                        }}
                      >
                        <option value="">تخصیص مشاور…</option>
                        {assignmentConsultants.filter((member) => member.isActive).map((member) => (
                          <option key={member.phone} value={member.phone}>{member.name}</option>
                        ))}
                      </select>
                    ) : null}
                    <button type="button" className="btn-ghost danger" disabled={bulkBusy} onClick={() => void bulkDelete()}><Trash2 size={15} /> حذف گروهی</button>
                    <button type="button" className="btn-ghost" disabled={bulkBusy} onClick={() => setSelectedIds([])}>پاک کردن انتخاب</button>
                  </div>
                ) : null}

                {loadingList && filtered.length === 0 ? (
                  <AdminListSkeleton rows={6} />
                ) : filtered.length === 0 ? (
                  <div className="admin-empty">
                    <Building2 size={28} />
                    <strong>فایلی نیست</strong>
                    <p>فیلتر را عوض کنید یا فایل جدید اضافه کنید.</p>
                    <button type="button" className="btn-gold" onClick={startNew}>
                      <Plus size={16} />
                      افزودن فایل
                    </button>
                  </div>
                ) : (
                  <div className="admin-property-list">
                    {filtered.map((property) => (
                      <article
                        key={property.id}
                        className={"admin-property-card" + (busyRowId === property.id ? " is-busy" : "")}
                      >
                        <label className="admin-property-select">
                          <input
                            type="checkbox"
                            aria-label={"انتخاب " + property.title}
                            checked={selectedIds.includes(property.id)}
                            onChange={() => toggleSelected(property.id)}
                            className="admin-row-checkbox"
                          />
                        </label>
                        <div className="admin-property-thumb">
                          <img
                            src={property.images[0] || getPropertyFallbackImage(property.propertyType, property.id)}
                            alt=""
                            loading="lazy"
                          />
                        </div>
                        <div className="admin-property-meta">
                          <div className="admin-property-tags">
                            <span data-status={property.status}>
                              {STATUS_LABEL[property.status]}
                            </span>
                            {property.featured ? <span data-featured>ویژه</span> : null}
                            {(() => {
                              const quality = propertyQuality(property);
                              return (
                                <span
                                  className={"admin-quality-badge" + (quality.complete ? " is-complete" : "")}
                                  title={"امتیاز تکمیل اطلاعات: " + quality.score + " از 100"}
                                >
                                  {quality.label} · {quality.score}
                                </span>
                              );
                            })()}
                          </div>
                          <h3>{property.title}</h3>
                          <p>
                            {property.neighborhood} · {property.contactName}
                          </p>
                          {(property.ownerName || property.ownerPhone || property.ownerInfo) ? (
                            <details className="admin-property-owner">
                              <summary>
                                <KeyRound size={13} aria-hidden="true" />
                                <span>
                                  مالک ثبت شده
                                  {property.ownerName ? ` · ${property.ownerName}` : ""}
                                </span>
                              </summary>
                              <div className="admin-property-owner-details">
                                {property.ownerPhone ? <span><strong>تماس:</strong> {property.ownerPhone}</span> : null}
                                {property.ownerInfo ? <span><strong>یادداشت:</strong> {property.ownerInfo}</span> : null}
                              </div>
                            </details>
                          ) : null}
                        </div>
                        <div className="admin-property-actions">
                          {property.status === "draft" ? (
                            <button
                              type="button"
                              className="admin-icon-btn"
                              title="انتشار سریع"
                              aria-label={"انتشار سریع «" + property.title + "»"}
                              disabled={busyRowId === property.id}
                              onClick={() => void quickSetStatus(property, "published")}
                            >
                              <Save size={16} />
                            </button>
                          ) : property.status === "published" ? (
                            <button
                              type="button"
                              className="admin-icon-btn"
                              title="بایگانی سریع"
                              aria-label={"بایگانی سریع «" + property.title + "»"}
                              disabled={busyRowId === property.id}
                              onClick={() => void quickSetStatus(property, "archived")}
                            >
                              <X size={16} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="admin-icon-btn"
                            title="ویرایش"
                            aria-label={"ویرایش «" + property.title + "»"}
                            onClick={() => editProperty(property)}
                          >
                            <FileEdit size={16} />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn"
                            title="کپی فایل"
                            aria-label={"ساخت کپی از «" + property.title + "»"}
                            onClick={() => duplicateProperty(property)}
                          >
                            <Copy size={16} />
                          </button>
                          <a
                            className="admin-icon-btn"
                            title="مشاهده در سایت"
                            aria-label={"مشاهده عمومی «" + property.title + "»"}
                            href={propertyPath(property)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink size={16} />
                          </a>
                          <button
                            type="button"
                            className="admin-icon-btn danger"
                            title="حذف فایل"
                            aria-label={"حذف «" + property.title + "»"}
                            disabled={busyRowId === property.id}
                            onClick={() => void removeProperty(property)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                {propertyHasMore || filteredTotal > pageSize ? (
                  <AdminPagination
                    page={page}
                    pageSize={pageSize}
                    total={filteredTotal}
                    busy={loadingList}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setPage(1);
                    }}
                  />
                ) : null}
              </section>
            </>
          ) : null}

          {view === "music" ? <AdminMusicManager /> : null}
          {view === "leads" ? <AdminLeadManager staffMode={staffMode} /> : null}
          {view === "messages" ? <AdminCustomerInbox /> : null}
          {view === "partners" ? <AdminPartnerManager /> : null}
          {view === "consultants" ? <AdminConsultantManager /> : null}
          {view === "consultantPerformance" ? <AdminConsultantPerformance /> : null}
          {view === "consultantTargets" ? <AdminConsultantTargets /> : null}
          {view === "attendance" ? <AdminAttendanceManager /> : null}
          {view === "matching" ? <AdminMatchingManager /> : null}
          {view === "owners" ? <AdminOwnerManager /> : null}
          {view === "finance" ? <><AdminFinanceManager /><AdminFinanceInsights /></> : null}
          {view === "backup" ? <AdminBackupManager /> : null}
          {view === "watermark" ? <AdminWatermarkSettings /> : null}
          {view === "schedule" ? <AdminScheduleManager /> : null}
          {view === "trash" ? <AdminTrashManager /> : null}
          {view === "audit" ? <AdminAuditLog /> : null}
          {view === "settings" ? <AdminSiteSettings /> : null}
          {view === "mediaHealth" ? <AdminMediaHealth /> : null}
          {view === "security" ? <AdminSecurityCenter /> : null}
          {view === "seoRedirects" ? <AdminSeoRedirects /> : null}
          {view === "contentStudio" ? <AdminContentStudio /> : null}
          {view === "divar" ? <AdminDivarFiles staffMode={staffMode} /> : null}

          {view === "form" ? (
            <form className="admin-form-wrap" onSubmit={onSubmit}>
              {draftRestored ? (
                <div style={{ marginBottom: 14 }}>
                  <AdminErrorBanner
                    message="یک پیش‌نویس ذخیره‌نشده از این فایل بازیابی شد. اگر نمی‌خواهید، آن را دور بریزید."
                    onDismiss={() => {
                      clearDraft(draftKeyRef.current);
                      setDraftRestored(null);
                      if (form.id) setForm(propertyToForm(properties.find((item) => item.id === form.id) ?? ({} as Property)));
                      else setForm(emptyForm());
                      setFormDirty(false);
                    }}
                  />
                </div>
              ) : null}

              <nav className="admin-section-nav" aria-label="بخش‌های فرم ملک">
                <a href="#section-basics">اطلاعات پایه</a>
                <a href="#section-specs">مشخصات</a>
                <a href="#section-pricing">قیمت</a>
                <a href="#section-location">موقعیت</a>
                <a href="#section-media">رسانه</a>
                <a href="#section-publish">مشاور و انتشار</a>
                {!staffMode ? <a href="#section-owner">اطلاعات صاحب فایل</a> : null}
                {form.id ? <a href="#section-performance">عملکرد</a> : null}
                {form.id ? <a href="#section-history">تاریخچه</a> : null}
              </nav>

              <div className="admin-form-sections">
                <fieldset className="admin-section" id="section-basics">
                  <legend>اطلاعات پایه</legend>
                  <div className="admin-form-grid">
                    <label className="field admin-span-2">
                      <span>عنوان</span>
                      <input
                        value={form.title}
                        onChange={(e) => update("title", e.target.value)}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>نوع معامله</span>
                      <select
                        value={form.transactionType}
                        onChange={(e) =>
                          update("transactionType", e.target.value as PropertyTransaction)
                        }
                      >
                        {TX_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>نوع ملک</span>
                      <select
                        value={form.propertyType}
                        onChange={(e) => update("propertyType", e.target.value as PropertyType)}
                      >
                        {PROPERTY_TYPES.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>محله</span>
                      <input
                        list="neighborhood-list"
                        value={form.neighborhood}
                        onChange={(e) => update("neighborhood", e.target.value)}
                        required
                      />
                      <datalist id="neighborhood-list">
                        {neighborhoodOptions.map((name) => (
                          <option key={name} value={name} />
                        ))}
                      </datalist>
                    </label>
                    {!staffMode ? (
                      <label className="field">
                        <span>آدرس دقیق (فقط مدیریت)</span>
                        <input
                          value={form.address}
                          onChange={(e) => update("address", e.target.value)}
                        />
                        <small style={{ display: "block", marginTop: 5, color: "var(--muted)", fontSize: ".72rem", lineHeight: 1.8 }}>
                          این آدرس برای اطلاعات داخلی فایل است و در صفحه عمومی ملک نمایش داده نمی‌شود.
                        </small>
                      </label>
                    ) : null}
                    <label className="field admin-span-2">
                      <span>توضیحات</span>
                      <textarea
                        rows={4}
                        value={form.description}
                        onChange={(e) => update("description", e.target.value)}
                      />
                    </label>
                  </div>
                </fieldset>

                <fieldset className="admin-section" id="section-location">
                  <legend>موقعیت و حریم خصوصی آدرس</legend>
                  <AdminLocationPicker
                    neighborhood={form.neighborhood}
                    latitude={form.latitude}
                    longitude={form.longitude}
                    onChange={(coordinates) => {
                      patchForm((prev) => ({
                        ...prev,
                        latitude: coordinates.latitude,
                        longitude: coordinates.longitude,
                      }));
                    }}
                  />
                </fieldset>

                <fieldset className="admin-section">
                  <legend>دستیار و کیفیت آگهی</legend>
                  <AdminListingAssistant
                    transactionType={form.transactionType}
                    propertyType={form.propertyType}
                    neighborhood={form.neighborhood}
                    areaM2={form.areaM2}
                    bedrooms={form.bedrooms}
                    bathrooms={form.bathrooms}
                    builtYear={form.builtYear}
                    parking={form.parking}
                    elevator={form.elevator}
                    storage={form.storage}
                    title={form.title}
                    description={form.description}
                    features={form.features}
                    imageCount={form.images.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean).length}
                    onApplyTitle={(value) => update("title", value)}
                    onApplyDescription={(value) => update("description", value)}
                  />
                </fieldset>

                <fieldset className="admin-section" id="section-specs">
                  <legend>مشخصات و امکانات</legend>
                  <div className="admin-form-grid admin-form-grid-dense">
                    <label className="field">
                      <span>متراژ (م²)</span>
                      <input value={form.areaM2} onChange={(e) => update("areaM2", e.target.value)} />
                    </label>
                    <label className="field">
                      <span>خواب</span>
                      <input value={form.bedrooms} onChange={(e) => update("bedrooms", e.target.value)} />
                    </label>
                    <label className="field">
                      <span>سرویس</span>
                      <input value={form.bathrooms} onChange={(e) => update("bathrooms", e.target.value)} />
                    </label>
                    <label className="field">
                      <span>طبقه</span>
                      <select
                        value={form.floorLabel === "suite" ? "suite" : form.floor}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "suite") {
                            patchForm((prev) => ({ ...prev, floor: "", floorLabel: "suite" }));
                            return;
                          }
                          patchForm((prev) => ({ ...prev, floor: value, floorLabel: null }));
                        }}
                      >
                        <option value="">انتخاب طبقه</option>
                        <option value="suite">سوئیت</option>
                        {FLOOR_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>کل طبقات</span>
                      <input value={form.totalFloors} onChange={(e) => update("totalFloors", e.target.value)} />
                    </label>
                    <label className="field">
                      <span>سال ساخت</span>
                      <input value={form.builtYear} onChange={(e) => update("builtYear", e.target.value)} />
                    </label>
                    <label className="field">
                      <span>موقعیت ملک</span>
                      <select
                        value={form.orientation ?? ""}
                        onChange={(e) => update("orientation", e.target.value ? e.target.value as Property["orientation"] : null)}
                      >
                        <option value="">انتخاب موقعیت</option>
                        {ORIENTATION_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="admin-form-grid admin-form-grid-dense admin-property-finish-grid">
                  <label className="field">
                    <span>نوع کابینت</span>
                    <select
                      value={form.cabinetType ?? ""}
                      onChange={(e) => update("cabinetType", e.target.value ? e.target.value as Property["cabinetType"] : null)}
                    >
                      <option value="">انتخاب کنید</option>
                      {PROPERTY_CABINET_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>کف</span>
                    <select
                      value={form.flooringType ?? ""}
                      onChange={(e) => update("flooringType", e.target.value ? e.target.value as Property["flooringType"] : null)}
                    >
                      <option value="">انتخاب کنید</option>
                      {PROPERTY_FLOORING_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>سیستم سرمایش</span>
                    <select
                      value={form.coolingSystem ?? ""}
                      onChange={(e) => update("coolingSystem", e.target.value ? e.target.value as Property["coolingSystem"] : null)}
                    >
                      <option value="">انتخاب کنید</option>
                      {PROPERTY_COOLING_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>سیستم گرمایش</span>
                    <select
                      value={form.heatingSystem ?? ""}
                      onChange={(e) => update("heatingSystem", e.target.value ? e.target.value as Property["heatingSystem"] : null)}
                    >
                      <option value="">انتخاب کنید</option>
                      {PROPERTY_HEATING_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>کمد دیواری</span>
                    <select
                      value={form.wallClosetType ?? ""}
                      onChange={(e) => update("wallClosetType", e.target.value ? e.target.value as Property["wallClosetType"] : null)}
                    >
                      <option value="">انتخاب کنید</option>
                      {PROPERTY_WALL_CLOSET_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <details className="admin-other-amenities">
                  <summary>
                    <span>
                      <strong>امکانات دیگر</strong>
                      <small>ویژگی‌های تکمیلی خانه را انتخاب کنید</small>
                    </span>
                    <span className="admin-other-amenities-summary-meta">
                      {form.otherAmenities.length.toLocaleString("fa-IR")} انتخاب
                      <ChevronDown size={17} aria-hidden="true" />
                    </span>
                  </summary>
                  <div className="admin-other-amenities-grid">
                    {PROPERTY_OTHER_AMENITY_OPTIONS.map((item) => {
                      const checked = form.otherAmenities.includes(item.value);
                      return (
                        <label key={item.value} className={checked ? "is-selected" : ""}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              patchForm((prev) => ({
                                ...prev,
                                otherAmenities: e.target.checked
                                  ? Array.from(new Set([...prev.otherAmenities, item.value]))
                                  : prev.otherAmenities.filter((value) => value !== item.value),
                              }))
                            }
                          />
                          <span>{item.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </details>

                <div className="admin-checks">
                    <label>
                      <input
                        type="checkbox"
                        checked={form.parking}
                        onChange={(e) => update("parking", e.target.checked)}
                      />
                      پارکینگ
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={form.elevator}
                        onChange={(e) => update("elevator", e.target.checked)}
                      />
                      آسانسور
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={form.storage}
                        onChange={(e) => update("storage", e.target.checked)}
                      />
                      انباری
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={form.painted}
                        onChange={(e) => update("painted", e.target.checked)}
                      />
                      رنگ‌آمیزی
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={form.wallpaper}
                        onChange={(e) => update("wallpaper", e.target.checked)}
                      />
                      کاغذ دیواری
                    </label>
                    {(form.transactionType === "rent" || form.transactionType === "mortgage") ? (
                      <label className="admin-convertible-toggle">
                        <input
                          type="checkbox"
                          checked={form.convertible}
                          onChange={(e) => update("convertible", e.target.checked)}
                        />
                        <span>
                          <strong>قابل تبدیل</strong>
                          <small>امکان جابه‌جایی بین رهن و اجاره در صفحه جزئیات</small>
                        </span>
                      </label>
                    ) : null}
                  </div>
                </fieldset>

                <fieldset className="admin-section" id="section-pricing">
                  <legend>قیمت و شرایط مالی</legend>
                  <AdminPricingPanel
                    transactionType={form.transactionType}
                    price={form.price}
                    deposit={form.deposit}
                    rent={form.rent}
                    onPriceChange={(value) => update("price", value)}
                    onDepositChange={(value) => update("deposit", value)}
                    onRentChange={(value) => update("rent", value)}
                  />
                  <div className="admin-form-grid" style={{ marginTop: 14 }}>
                    <label className="field admin-span-2">
                      <span>ویژگی‌ها (هر خط یک مورد)</span>
                      <textarea
                        rows={3}
                        value={form.features}
                        onChange={(e) => update("features", e.target.value)}
                      />
                    </label>
                  </div>
                </fieldset>

                <fieldset className="admin-section" id="section-media">
                  <legend>رسانه (تصویر و ویدیو)</legend>
                  <AdminMediaField
                    value={form.images}
                    onChange={(next) => update("images", next)}
                    propertyType={form.propertyType}
                    propertyId={form.id}
                  />
                  <div className="admin-floor-plan-separator" aria-hidden="true">
                    <span />
                    <strong>پلان معماری</strong>
                    <span />
                  </div>
                  <label className="field admin-span-2">
                    <span>پلان واقعی ملک (اختیاری)</span>
                    <small className="admin-field-help">
                      پلان را جدا از تصاویر گالری ثبت کنید؛ در صفحه ملک به‌عنوان «پلان واقعی» نمایش داده می‌شود.
                    </small>
                    <AdminFloorPlanField
                      value={form.floorPlanUrl}
                      onChange={(next) => update("floorPlanUrl", next)}
                    />
                  </label>
                  <div className="admin-form-grid" style={{ marginTop: 14 }}>
                    <label className="field admin-span-2">
                      <span>لینک تور مجازی ۳۶۰ (اختیاری)</span>
                      <input
                        dir="ltr"
                        value={form.virtualTourUrl}
                        onChange={(e) => update("virtualTourUrl", e.target.value)}
                        placeholder="https://…"
                        inputMode="url"
                      />
                      <small style={{ display: "block", marginTop: 5, color: "var(--muted)", fontSize: ".72rem", lineHeight: 1.8 }}>
                        لینک باید HTTPS باشد. در صفحه فایل به‌صورت امن در یک پنل جداگانه نمایش داده می‌شود.
                      </small>
                    </label>
                  </div>
                </fieldset>

                <AdminPropertyDuplicateCheck
                  id={form.id}
                  title={form.title}
                  transactionType={form.transactionType}
                  propertyType={form.propertyType}
                  neighborhood={form.neighborhood}
                  areaM2={numberOrNull(form.areaM2)}
                  price={numberOrNull(form.price)}
                  deposit={numberOrNull(form.deposit)}
                  rent={numberOrNull(form.rent)}
                />
                {form.id ? (
                  <>
                    <AdminPropertyQuestions propertyId={form.id} />
                    <AdminPropertyOpenHouse propertyId={form.id} />
                  </>
                ) : null}

                <fieldset className="admin-section" id="section-publish">
                  <legend>مشاور و وضعیت انتشار</legend>
                  <AdminConsultantPicker
                    contactName={form.contactName}
                    contactPhone={form.contactPhone}
                    onSelect={(member) => {
                      patchForm((prev) => ({
                        ...prev,
                        contactName: member.name,
                        contactPhone: member.phone,
                      }));
                    }}
                  />
                  <AdminPublishReadiness
                    compact
                    transactionType={form.transactionType}
                    title={form.title}
                    neighborhood={form.neighborhood}
                    description={form.description}
                    contactName={form.contactName}
                    contactPhone={form.contactPhone}
                    price={form.price}
                    deposit={form.deposit}
                    rent={form.rent}
                    imageCount={form.images.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean).length}
                    areaM2={form.areaM2}
                    features={form.features}
                    latitude={form.latitude}
                    longitude={form.longitude}
                  />
                  <div className="admin-form-grid" style={{ marginTop: 14 }}>
                    <label className="field">
                      <span>نام مشاور</span>
                      <input
                        value={form.contactName}
                        onChange={(e) => update("contactName", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>تلفن مشاور</span>
                      <input
                        dir="ltr"
                        value={form.contactPhone}
                        onChange={(e) => update("contactPhone", e.target.value)}
                      />
                    </label>
{!staffMode ? (
                      <label className="field">
                        <span>وضعیت انتشار</span>
                        <select
                          value={form.status}
                          onChange={(e) => update("status", e.target.value as PublishStatus)}
                        >
                          <option value="published" disabled={adminRole !== "owner" && adminRole !== "manager"}>منتشرشده</option>
                          <option value="draft">پیش‌نویس</option>
                          <option value="archived">بایگانی</option>
                        </select>
                      </label>
                    ) : null}
                    <label className="field">
                      <span>وضعیت معامله</span>
                      <select
                        value={form.availabilityStatus}
                        onChange={(e) => update("availabilityStatus", e.target.value as PropertyAvailabilityStatus)}
                      >
                        {Object.entries(AVAILABILITY_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
{!staffMode ? (
                    <>
                      <label
                        className="field"
                        style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 22 }}
                      >
                        <input
                          type="checkbox"
                          checked={form.featured}
                          onChange={(e) => update("featured", e.target.checked)}
                          style={{ accentColor: "var(--brass-600)", width: 18, height: 18 }}
                        />
                        <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--navy-900)", fontWeight: 700 }}>
                          <Star size={15} /> فایل ویژه
                        </span>
                      </label>
                      <label className="field">
                        <span>پایان ویژه (اختیاری)</span>
                        <input
                          type="datetime-local"
                          value={form.featuredUntil}
                          onChange={(e) => update("featuredUntil", e.target.value)}
                          disabled={!form.featured}
                        />
                        <small className="admin-field-help">
                          خالی = بدون انقضا. بعد از این زمان، فایل خودکار از اولویت «ویژه» خارج می‌شود.
                        </small>
                      </label>
                    </>
                    ) : null}
                  </div>
                </fieldset>
              </div>

                <fieldset className="admin-section" id="section-internal">
                  <legend>یادداشت داخلی و اولویت فایل — خصوصی</legend>
                  <div className="admin-private-notice">
                    این اطلاعات فقط برای تیم هیرمند است و در صفحه عمومی ملک نمایش داده نمی‌شود.
                  </div>
                  <div className="admin-form-grid">
                    <label className="field">
                      <span>اولویت پیگیری فایل</span>
                      <select
                        value={form.internalPriority}
                        onChange={(e) => update("internalPriority", e.target.value as FormState["internalPriority"])}
                      >
                        <option value="urgent">فوری</option>
                        <option value="high">مهم</option>
                        <option value="normal">عادی</option>
                        <option value="low">کم‌اهمیت</option>
                      </select>
                    </label>
                    <label className="field admin-span-2">
                      <span>یادداشت داخلی</span>
                      <textarea
                        rows={4}
                        value={form.internalNote}
                        onChange={(e) => update("internalNote", e.target.value)}
                        placeholder="زمان مناسب تماس، شرایط مالک، نکات مذاکره یا هر اطلاعات داخلی دیگر..."
                        maxLength={3000}
                      />
                    </label>
                  </div>
                </fieldset>

                {!staffMode ? (
                  <fieldset className="admin-section admin-owner-section" id="section-owner">
                    <legend>اطلاعات صاحب فایل — خصوصی</legend>
                  <div className="admin-private-notice">
                    این بخش فقط برای مدیریت هیرمند است و اطلاعات صاحب فایل در صفحه عمومی ملک یا کارت فایل نمایش داده نمی‌شود.
                  </div>
                  <div className="admin-form-grid">
                    <label className="field">
                      <span>نام صاحب فایل</span>
                      <input
                        value={form.ownerName}
                        onChange={(e) => update("ownerName", e.target.value)}
                        autoComplete="name"
                        placeholder="مثلاً آقای احمدی"
                      />
                    </label>
                    <label className="field">
                      <span>شماره تماس صاحب فایل</span>
                      <input
                        dir="ltr"
                        inputMode="tel"
                        value={form.ownerPhone}
                        onChange={(e) => update("ownerPhone", e.target.value)}
                        autoComplete="tel"
                        placeholder="0913 000 0000"
                      />
                    </label>
                    <label className="field admin-span-2">
                      <span>اطلاعات و توضیحات صاحب فایل</span>
                      <textarea
                        rows={4}
                        value={form.ownerInfo}
                        onChange={(e) => update("ownerInfo", e.target.value)}
                        placeholder="نکات تماس، شرایط مالک، زمان مناسب تماس یا هر اطلاعات داخلی دیگر..."
                      />
                    </label>
                  </div>
                  </fieldset>
                ) : null}

              {form.id ? <div id="section-performance"><AdminPropertyPerformance propertyId={form.id} /></div> : null}
              {form.id ? <AdminPropertyPriceHistory propertyId={form.id} /> : null}

              {form.id ? (
                <fieldset className="admin-section" id="section-history">
                  <legend>تاریخچه فایل</legend>
                  {changeHistory.length === 0 ? (
                    <div className="admin-empty">
                      <span>هنوز سابقه‌ای برای این فایل ثبت نشده است.</span>
                    </div>
                  ) : (
                    <div className="admin-breakdown">
                      {changeHistory.map((item) => {
                        const changes: string[] = [];
                        if (item.action === "created") changes.push("فایل ایجاد شد");
                        if (item.action === "deleted") changes.push("فایل حذف شد");
                        if (item.action === "updated") {
                          if (item.beforeStatus !== item.afterStatus) {
                            const labels: Record<string, string> = {
                              published: "منتشرشده",
                              draft: "پیش‌نویس",
                              archived: "بایگانی",
                            };
                            changes.push(
                              "وضعیت: " +
                                (labels[String(item.beforeStatus)] ?? String(item.beforeStatus ?? "—")) +
                                " ← " +
                                (labels[String(item.afterStatus)] ?? String(item.afterStatus ?? "—")),
                            );
                          }
                          if (item.beforeFeatured !== item.afterFeatured) {
                            changes.push(item.afterFeatured === true ? "ویژه شد" : "از حالت ویژه خارج شد");
                          }
                          if (item.beforeContactName !== item.afterContactName) {
                            changes.push("مشاور تغییر کرد");
                          }
                          if (
                            item.beforeOwnerName !== item.afterOwnerName ||
                            item.beforeOwnerPhone !== item.afterOwnerPhone ||
                            item.beforeOwnerInfo !== item.afterOwnerInfo
                          ) {
                            changes.push("اطلاعات مالک تغییر کرد");
                          }
                          if (
                            item.beforeTitle !== item.afterTitle ||
                            item.beforePrice !== item.afterPrice ||
                            item.beforeDeposit !== item.afterDeposit ||
                            item.beforeRent !== item.afterRent
                          ) {
                            changes.push("اطلاعات اصلی/قیمت ویرایش شد");
                          }
                          if (!changes.length) changes.push("اطلاعات فایل ویرایش شد");
                        }

                        const title = item.afterTitle ?? item.beforeTitle ?? form.title;
                        return (
                          <div key={item.id} className="admin-breakdown-row">
                            <div>
                              <span>{changes.join(" · ")}</span>
                              <strong>
                                {new Date(item.changedAt).toLocaleDateString("fa-IR")} ·{" "}
                                {new Date(item.changedAt).toLocaleTimeString("fa-IR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </strong>
                            </div>
                            <small>{title}</small>
                            {item.action === "updated" && item.beforeState ? <button type="button" className="btn-ghost" style={{ marginTop: 8, minHeight: 34, fontSize: ".68rem" }} onClick={() => loadHistoryVersion(item)}>بارگذاری این نسخه</button> : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </fieldset>
              ) : null}

              <div className="admin-sticky-bar">
                <div className="admin-sticky-bar-info">
                  مشاور: <strong>{form.contactName || "—"}</strong>
                  {formDirty ? " · تغییرات ذخیره‌نشده" : " · همه‌چیز ذخیره شده"}
                </div>
                <div className="admin-sticky-actions">
                  <AdminPropertyPreview data={{title:form.title,transactionType:form.transactionType,propertyType:form.propertyType,neighborhood:form.neighborhood,areaM2:form.areaM2,bedrooms:form.bedrooms,bathrooms:form.bathrooms,floor:form.floorLabel==="suite"?"سوئیت":form.floor,parking:form.parking,elevator:form.elevator,storage:form.storage,price:form.price,deposit:form.deposit,rent:form.rent,description:form.description,images:form.images,contactName:form.contactName,contactPhone:form.contactPhone,featured:form.featured,status:form.status}} />
                  <button type="button" className="btn-ghost" onClick={() => navigateTo(staffMode ? "staffHome" : "list")} disabled={saving}>
                    انصراف
                  </button>
                  <button type="submit" className="btn-gold" disabled={saving} aria-busy={saving}>
                    {saving ? <RefreshCw size={16} className="admin-spin" /> : <Save size={16} />}
                    {saving ? "در حال ذخیره…" : "ذخیره"}
                  </button>
                </div>
              </div>
            </form>
          ) : null}
        </div>
      </div>

      <nav
        className={"admin-mobile-nav" + (view === "form" ? " is-form-active" : "")}
        aria-label="ناوبری سریع مدیریت"
      >
        {staffMode ? (
          <>
            <button type="button" className={view === "staffHome" ? "is-active" : ""} onClick={() => navigateTo("staffHome")} title="خانه کارکنان">
              <LayoutDashboard size={19} strokeWidth={2.1} /><span>خانه</span>
            </button>
            <button type="button" className={view === "form" ? "is-active" : ""} onClick={startNew} title="افزودن فایل">
              <Plus size={20} strokeWidth={2.25} /><span>فایل جدید</span>
            </button>
            <button type="button" className={view === "leads" ? "is-active" : ""} onClick={() => navigateTo("leads")} title="درخواست‌های مشتریان">
              <UsersRound size={19} strokeWidth={2.1} /><span>درخواست‌ها</span>
            </button>
            <button type="button" className={view === "matching" ? "is-active" : ""} onClick={() => navigateTo("matching")} title="مچ کردن">
              <GitCompareArrows size={19} strokeWidth={2.1} /><span>مچینگ</span>
            </button>
            <button type="button" className={view === "divar" ? "is-active" : ""} onClick={() => navigateTo("divar")} title="دریافت از دیوار">
              <Globe2 size={19} strokeWidth={2.1} /><span>دیوار</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={view === "dashboard" ? "is-active" : ""}
              onClick={() => navigateTo("dashboard")}
              title="داشبورد"
            >
              <BarChart3 size={19} strokeWidth={2.1} />
              <span>داشبورد</span>
            </button>
            <button
              type="button"
              className={view === "list" ? "is-active" : ""}
              onClick={() => navigateTo("list")}
              title="فهرست فایل‌ها"
            >
              <LayoutDashboard size={19} strokeWidth={2.1} />
              <span>فهرست</span>
            </button>
            <button
              type="button"
              className={view === "form" && !form.id ? "is-active" : ""}
              onClick={startNew}
              title="افزودن فایل"
            >
              <Plus size={20} strokeWidth={2.25} />
              <span>جدید</span>
            </button>
            <button type="button" className={view === "leads" ? "is-active" : ""} onClick={() => navigateTo("leads")} title="درخواست‌های مشتریان">
              <UsersRound size={19} strokeWidth={2.1} />
              <span>درخواست‌ها</span>
            </button>
            <button type="button" onClick={() => setDrawerOpen(true)} title="باز کردن منوی کامل" aria-label="باز کردن منوی کامل مدیریت">
              <Menu size={19} strokeWidth={2.1} />
              <span>منو</span>
            </button>
          </>
        )}
        <Link to="/" className="admin-mobile-site" title="مشاهده سایت">
          <Home size={19} strokeWidth={2.1} />
          <span>سایت</span>
        </Link>
      </nav>
    </div>
  );
}
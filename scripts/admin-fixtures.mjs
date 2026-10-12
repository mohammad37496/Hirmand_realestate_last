/**
 * Fixtures for the admin UI sweep.
 *
 * The dev server (Vite) does not register the nitro `server/routes/api/*`
 * handlers, so the browser needs them stubbed to render the authenticated
 * panel. Everything else — server functions, the database, React — runs for
 * real.
 *
 * Against a production preview (`npm run preview:restart`, port 8081) those
 * routes DO exist, and stubbing them there would replace the exact thing the
 * sweep is meant to exercise. `installAdminApiStubs` probes first and only
 * fills in what is genuinely missing, so the same script can be pointed at
 * either server.
 */

/** True when the target already serves the nitro API routes. */
export async function servesNitroApi(base) {
  try {
    const response = await fetch(new URL("/api/music", base), {
      method: "GET",
      headers: { accept: "application/json" },
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

/**
 * Installs only the stubs the target server is missing.
 * Returns the list of route patterns that were stubbed, for the report.
 */
export async function installAdminApiStubs(page, base) {
  if (await servesNitroApi(base)) return [];
  // Registered first, so it stays the lowest-priority handler: Playwright
  // matches the most recently registered route first, so every explicit stub
  // below still wins over this fallback.
  await page.route("**/api/**", async (route) => {
    unshapedFallbacks.add(new URL(route.request().url()).pathname);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
  for (const [pattern, handler] of Object.entries(stubAdminApi)) {
    await page.route(pattern, handler);
  }
  return Object.keys(stubAdminApi);
}

/**
 * Paths the generic fallback answered instead of an explicit fixture. The sweep
 * prints them so an empty-state render is never mistaken for a shaped one.
 */
export const unshapedFallbacks = new Set();

/**
 * Mints the same JWT the real `/api/admin/session` route issues, so the server
 * functions (`listAdminProperties`, `listConsultants`, …) see a valid session
 * even though only the nitro route is stubbed.
 */
let cachedSessionCookie = null;
async function adminSessionCookie() {
  if (cachedSessionCookie) return cachedSessionCookie;
  const { createHash } = await import("node:crypto");
  const { SignJWT } = await import("jose");

  const key = process.env.HIRMAND_ADMIN_KEY;
  if (!key) throw new Error("HIRMAND_ADMIN_KEY is required for the admin QA sweep.");
  const secret = createHash("sha256").update(key.trim()).digest();

  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("hirmand-admin")
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);

  cachedSessionCookie = `hirmand-admin=${token}; Path=/; HttpOnly; SameSite=Lax`;
  return cachedSessionCookie;
}

export const stubAdminApi = {
  "**/api/admin/session": async (route) => {
    let body = {};
    try {
      body = route.request().postDataJSON() ?? {};
    } catch {
      body = {};
    }
    if (body.action === "logout") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "set-cookie": "hirmand-admin=; Max-Age=0; Path=/" },
        body: JSON.stringify({ success: true }),
      });
    }
    if (body.action === "login" && !body.adminKey) {
      // Session probe before login.
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, authenticated: false }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "set-cookie": await adminSessionCookie() },
      body: JSON.stringify({ success: true, authenticated: true }),
    });
  },

  "**/api/admin-dashboard": async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        properties: {
          total: 128,
          published: 96,
          draft: 24,
          archived: 8,
          featured: 6,
          withoutImages: 11,
          newLast7: 9,
          incomplete: 17,
        },
        consultants: { total: 7, active: 6, withFiles: 5, withLeads: 4 },
        leads: {
          total: 214,
          new: 18,
          contacted: 41,
          follow_up: 27,
          visited: 12,
          contract: 9,
          closed: 96,
          spam: 11,
          today: 5,
          last7: 22,
          last30: 71,
        },
        propertyTypes: [
          { type: "apartment", count: 72 },
          { type: "villa", count: 24 },
          { type: "office", count: 18 },
          { type: "land", count: 9 },
          { type: "heritage", count: 3 },
          { type: "commercial", count: 2 },
        ],
        leadDays: [
          { day: "2026-09-24", count: 4 },
          { day: "2026-09-25", count: 7 },
          { day: "2026-09-26", count: 3 },
          { day: "2026-09-27", count: 9 },
          { day: "2026-09-28", count: 6 },
          { day: "2026-09-29", count: 8 },
          { day: "2026-09-30", count: 5 },
        ],
        music: { total: 6, active: 4, sizeBytes: 18_400_000 },
        visitors: {
          today: 64,
          last7: 412,
          last30: 1_780,
          pageviewsToday: 190,
          pageviewsLast7: 1_240,
          pageviewsLast30: 5_310,
          activeNow: 7,
        },
        visitorDays: [
          { day: "2026-09-28", uniqueVisitors: 180, pageviews: 520 },
          { day: "2026-09-29", uniqueVisitors: 96, pageviews: 260 },
          { day: "2026-09-30", uniqueVisitors: 64, pageviews: 190 },
        ],
        topPages: [
          { path: "/properties", pageviews: 640, uniqueVisitors: 420 },
          { path: "/", pageviews: 512, uniqueVisitors: 380 },
          { path: "/properties/apartment-sale", pageviews: 210, uniqueVisitors: 150 },
        ],
        topProperties: [
          {
            slug: "sample-one",
            title: "آپارتمان ۱۲۰ متری اصفهان",
            neighborhood: "چهارباغ",
            views: 320,
            uniqueViews: 210,
            calls: 18,
            whatsapp: 24,
            favorites: 12,
          },
        ],
        eventStats: [
          { event: "property_view", count: 1240, uniqueVisitors: 430 },
          { event: "call_click", count: 86, uniqueVisitors: 70 },
          { event: "inquiry_submit", count: 41, uniqueVisitors: 39 },
        ],
        visitorSources: [
          { source: "direct", campaign: "بدون کمپین", visitors: 620 },
          { source: "instagram.com", campaign: "story", visitors: 210 },
        ],
        consultantPerformance: [
          {
            id: "c1",
            name: "آقای شیخ",
            phone: "09131056029",
            active: true,
            files: 24,
            leads: 42,
            contracts: 12,
            views: 420,
            calls: 18,
            whatsapp: 24,
          },
        ],
        leadSla: { overdue: 4, newOver4Hours: 2 },
        followUps: { due: 6, next7: 14 },
        recentLeads: [
          {
            id: "l1",
            name: "زهرا محمدی",
            phone: "09121112233",
            deal: "خرید",
            neighborhood: "مرداویج",
            status: "new",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    }),

  "**/api/admin-sales-control-center": async (route) => {
    let body = {};
    try {
      body = route.request().postDataJSON() ?? {};
    } catch {
      body = {};
    }
    const days = [7, 30, 90].includes(Number(body.days)) ? Number(body.days) : 30;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        days,
        pipeline: { new: 18, contacted: 41, follow_up: 27, visited: 12, contract: 9 },
        summary: {
          consultants: 3,
          activeConsultants: 3,
          activeLeads: 28,
          overdueLeads: 4,
          visitRequests: 5,
          contracts: 9,
          totalViews: 1240,
        },
        consultants: [
          {
            id: "c1",
            name: "آقای شیخ",
            phone: "09131056029",
            active: true,
            files: 24,
            leads: 42,
            periodLeads: 18,
            activeLeads: 11,
            new7d: 5,
            overdueLeads: 2,
            nextFollowUps: 4,
            visitRequests: 2,
            contracts: 12,
            periodContracts: 4,
            views: 420,
            conversionRate: 22.2,
          },
          {
            id: "c2",
            name: "آقای مرادی",
            phone: "09130000000",
            active: true,
            files: 18,
            leads: 35,
            periodLeads: 14,
            activeLeads: 9,
            new7d: 3,
            overdueLeads: 1,
            nextFollowUps: 6,
            visitRequests: 2,
            contracts: 8,
            periodContracts: 3,
            views: 330,
            conversionRate: 21.4,
          },
          {
            id: "c3",
            name: "مشاور نمونه",
            phone: "09120000000",
            active: true,
            files: 12,
            leads: 21,
            periodLeads: 9,
            activeLeads: 8,
            new7d: 2,
            overdueLeads: 1,
            nextFollowUps: 3,
            visitRequests: 1,
            contracts: 3,
            periodContracts: 2,
            views: 190,
            conversionRate: 22.2,
          },
        ],
      }),
    });
  },

  "**/api/admin-operations": async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        dueCount: 2,
        dueLeads: [
          {
            id: "lead-1",
            name: "زهرا محمدی",
            phone: "09121112233",
            deal: "خرید",
            neighborhood: "مرداویج",
            status: "follow_up",
            followUpAt: new Date().toISOString(),
          },
          {
            id: "lead-2",
            name: "رضا کریمی",
            phone: "09123334455",
            deal: "رهن و اجاره",
            neighborhood: "چهارباغ",
            status: "contacted",
            followUpAt: new Date().toISOString(),
          },
        ],
        next7Count: 14,
        staleProperties: 5,
        finance: { income: 1_850_000_000, expense: 620_000_000, balance: 1_230_000_000 },
      }),
    }),

  "**/api/admin-visit-feedback": async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        total: 36,
        average: 4.2,
        interested: 19,
        recent: [
          {
            id: "f1",
            rating: 5,
            interest: "high",
            note: "بازدید انجام شد و برای واحد مشابه درخواست قیمت داد.",
            createdAt: new Date().toISOString(),
            trackingToken: "vt-2f19",
            name: "مریم نوری",
            consultant: "آقای شیخ",
            deal: "خرید",
            propertyTitle: "آپارتمان نمونه در چهارباغ",
            propertySlug: "sample-one",
          },
          {
            id: "f2",
            rating: 3,
            interest: "medium",
            note: "قیمت برای بودجه درخواستی بالا بود.",
            createdAt: new Date(Date.now() - 86_400_000).toISOString(),
            trackingToken: "vt-8ac4",
            name: "سینا راد",
            consultant: "آقای مرادی",
            deal: "رهن و اجاره",
            propertyTitle: "ویلای نمونه در سپاهان‌شهر",
            propertySlug: "sample-two",
          },
        ],
      }),
    }),

  "**/api/admin-productivity": async (route) => {
    let body = {};
    try {
      body = route.request().postDataJSON() ?? {};
    } catch {
      body = {};
    }
    const tasks = [
      {
        id: "t1",
        title: "تماس با مشتری چهارباغ",
        description: "پیگیری بودجه و زمان بازدید.",
        status: "open",
        priority: "urgent",
        dueAt: new Date(Date.now() - 3_600_000).toISOString(),
        assignee: "آقای شیخ",
        entityType: "lead",
        entityId: "lead-1",
        createdAt: new Date(Date.now() - 172_800_000).toISOString(),
        updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
      },
      {
        id: "t2",
        title: "به‌روزرسانی قیمت فایل نمونه",
        description: "قیمت با نرخ روز بازار به‌روزرسانی شود.",
        status: "open",
        priority: "high",
        dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        assignee: "آقای مرادی",
        entityType: "property",
        entityId: "p-1",
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
        updatedAt: new Date(Date.now() - 43_200_000).toISOString(),
      },
    ];
    if (body.action === "list_tasks") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ tasks }),
      });
    }
    if (body.action !== "summary") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tasks: { open: 2, overdue: 1, today: 1, next7: 2 },
        propertyHealth: {
          total: 128,
          published: 96,
          withoutImages: 11,
          incomplete: 17,
          stale: 5,
          expiredFeatured: 2,
        },
        staleProperties: [
          {
            id: "p-1",
            slug: "sample-one",
            title: "آپارتمان نمونه در چهارباغ",
            neighborhood: "چهارباغ",
            updatedAt: new Date(Date.now() - 46 * 86_400_000).toISOString(),
          },
        ],
        expiredFeatured: [
          {
            id: "p-2",
            slug: "sample-two",
            title: "ویلای نمونه در سپاهان‌شهر",
            featuredUntil: new Date(Date.now() - 86_400_000).toISOString(),
          },
        ],
        duplicateGroups: [
          {
            kind: "title",
            key: "sample-one",
            label: "آپارتمان نمونه در چهارباغ",
            neighborhood: "چهارباغ",
            fileCount: 2,
            files: [
              { id: "p-1", slug: "sample-one", title: "آپارتمان نمونه در چهارباغ" },
              { id: "p-3", slug: "sample-one-copy", title: "آپارتمان نمونه در چهارباغ" },
            ],
          },
        ],
        recentActivity: [
          {
            source: "lead",
            itemId: "lead-1",
            event: "lead_created",
            title: "لید جدید: زهرا محمدی",
            createdAt: new Date(Date.now() - 7_200_000).toISOString(),
          },
        ],
        system: {
          database: "PostgreSQL",
          counts: { properties: 128, leads: 214, consultants: 7 },
          generatedAt: new Date().toISOString(),
        },
      }),
    });
  },

  "**/api/admin-neighborhood-demand": async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            neighborhood: "چهارباغ",
            files: 34,
            views: 512,
            favorites: 41,
            calls: 28,
            visits: 12,
            leads: 18,
            demandIndex: 96,
            demandPercent: 100,
          },
          {
            neighborhood: "مرداویج",
            files: 27,
            views: 388,
            favorites: 22,
            calls: 17,
            visits: 6,
            leads: 9,
            demandIndex: 64,
            demandPercent: 67,
          },
          {
            neighborhood: "سپاهان‌شهر",
            files: 19,
            views: 190,
            favorites: 9,
            calls: 6,
            visits: 3,
            leads: 4,
            demandIndex: 31,
            demandPercent: 32,
          },
        ],
      }),
    }),

  "**/api/admin-property-lifecycle": async (route) => {
    let body = {};
    try {
      body = route.request().postDataJSON() ?? {};
    } catch {
      body = {};
    }
    const items = [
      {
        id: "p-1",
        slug: "sample-one",
        title: "آپارتمان نمونه در چهارباغ",
        neighborhood: "چهارباغ",
        contactName: "آقای شیخ",
        staleDays: 46,
        missing: ["images", "price"],
        priority: "urgent",
        hasOpenTask: false,
        updatedAt: new Date(Date.now() - 46 * 86_400_000).toISOString(),
      },
      {
        id: "p-2",
        slug: "sample-two",
        title: "ویلای نمونه در سپاهان‌شهر",
        neighborhood: "سپاهان‌شهر",
        contactName: "آقای مرادی",
        staleDays: 21,
        missing: ["images"],
        priority: "high",
        hasOpenTask: true,
        updatedAt: new Date(Date.now() - 21 * 86_400_000).toISOString(),
      },
    ];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        body.action === "createTasks" ? { items, createdTasks: 2 } : { items },
      ),
    });
  },

  "**/api/admin-campaign-performance": async (route) => {
    let body = {};
    try {
      body = route.request().postDataJSON() ?? {};
    } catch {
      body = {};
    }
    const days = [7, 30, 90].includes(Number(body.days)) ? Number(body.days) : 30;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        days,
        rows: [
          { source: "instagram", medium: "story", campaign: "baharestan", leads: 18, contacted: 14, visits: 7, contracts: 3, contactRate: 77.8, contractRate: 16.7 },
          { source: "google", medium: "organic", campaign: "بدون کمپین", leads: 12, contacted: 9, visits: 4, contracts: 2, contactRate: 75, contractRate: 16.7 },
        ],
        daily: [
          { day: "2026-09-24", leads: 4, contracts: 1 },
          { day: "2026-09-25", leads: 7, contracts: 1 },
          { day: "2026-09-26", leads: 3, contracts: 0 },
          { day: "2026-09-27", leads: 9, contracts: 2 },
          { day: "2026-09-28", leads: 6, contracts: 1 },
          { day: "2026-09-29", leads: 8, contracts: 0 },
          { day: "2026-09-30", leads: 5, contracts: 1 },
        ],
        quality: { leads: 30, source: 88, medium: 62, campaign: 41 },
        totals: { campaigns: 2, leads: 30, contacted: 23, visits: 11, contracts: 5 },
      }),
    });
  },


  "**/api/leads-admin": async (route) => {
    let body = {};
    try {
      body = route.request().postDataJSON() ?? {};
    } catch {
      body = {};
    }
    if (body.action === "export") {
      return route.fulfill({
        status: 200,
        contentType: "text/csv; charset=utf-8",
        body: "name,phone\n",
      });
    }
    if (body.action === "status" || body.action === "delete" || body.action === "note") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, note: body.note ?? "" }),
      });
    }
    const total = 214;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ total, leads: buildLeads(Math.min(body.limit ?? 25, total)) }),
    });
  },

  "**/api/music-admin": async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tracks: [
          {
            id: "t1",
            title: "آرامش اصفهان",
            artist: "گروه هیرمند",
            url: "/music/sample.mp3",
            mimeType: "audio/mpeg",
            sizeBytes: 4_200_000,
            active: true,
            position: 0,
            createdAt: new Date().toISOString(),
          },
          {
            id: "t2",
            title: "باران مهر",
            artist: "",
            url: "/music/sample-2.mp3",
            mimeType: "audio/mpeg",
            sizeBytes: 3_100_000,
            active: false,
            position: 1,
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    }),

  "**/api/admin/partners": async (route) => {
    let body = {};
    try {
      body = route.request().postDataJSON() ?? {};
    } catch {
      body = {};
    }
    if (body.action === "details") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          partner: buildPartnerOverview(),
          contracts: [],
          audits: [],
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        partners: [
          buildPartnerSummary({
            id: "p1",
            partnerCode: "SPH-1042",
            agencyName: "املاک سپهر",
            contactName: "آقای سپهری",
            status: "active",
            cardStamps: 7,
            contractCount: 4,
          }),
          buildPartnerSummary({
            id: "p2",
            partnerCode: "KVR-2087",
            agencyName: "املاک کویر",
            contactName: "خانم کریمی",
            status: "suspended",
            cardStamps: 0,
            contractCount: 0,
            lastLoginAt: null,
          }),
        ],
        pendingContracts: [],
      }),
    });
  },

  "**/api/admin-sales-funnel": async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        days: 30,
        statuses: [
          { key: "new", label: "جدید", count: 18 },
          { key: "contacted", label: "تماس گرفته شد", count: 41 },
          { key: "follow_up", label: "پیگیری", count: 27 },
          { key: "visited", label: "بازدید", count: 12 },
          { key: "contract", label: "قرارداد", count: 9 },
          { key: "closed", label: "بسته‌شده", count: 96 },
          { key: "spam", label: "اسپم", count: 11 },
        ],
        sources: [{ source: "website", count: 52 }, { source: "اینستاگرام", count: 18 }],
        aging: [
          { key: "less_24h", count: 14 },
          { key: "1_3d", count: 19 },
          { key: "3_7d", count: 9 },
          { key: "over_7d", count: 5 },
        ],
        conversions: { total: 214, contacted: 41, visited: 12, contract: 9, contactedRate: 19.2, visitRate: 5.6, contractRate: 4.2 },
      }),
    }),

  "**/api/admin-management-report": async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        days: 30,
        properties: { created: 18, published: 12, draft: 4, archived: 2 },
        leads: { created: 71, open: 45, contract: 9, closed: 17 },
        deals: { created: 11, completed: 6, contracted: 3, volume: 18500000000, commission: 420000000 },
        finance: { income: 1850000000, expense: 620000000, balance: 1230000000 },
        topConsultants: [
          { name: "آقای شیخ", deals: 4, volume: 9200000000 },
          { name: "آقای مرادی", deals: 2, volume: 5100000000 },
        ],
      }),
    }),

  "**/api/admin-property-price-history": async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        property: { id: "sample-one", title: "آپارتمان نمونه", price: 8500000000, deposit: null, rent: null, priceChangedAt: new Date().toISOString(), priceDropPercent: 5.3 },
        history: [
          { id: 1, priceBefore: 9000000000, priceAfter: 8500000000, depositBefore: null, depositAfter: null, rentBefore: null, rentAfter: null, pricePercent: -5.6, depositPercent: null, rentPercent: null, note: "", createdBy: "مدیریت", createdAt: new Date().toISOString() },
        ],
      }),
    }),

  "**/api/admin/properties-export": async (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/csv; charset=utf-8",
      body: "id,title\n1,نمونه\n",
    }),
};

export function buildPartnerSummary(overrides = {}) {
  return {
    id: "p1",
    partnerCode: "SPH-1042",
    agencyName: "املاک سپهر",
    contactName: "آقای سپهری",
    phone: "09120000000",
    status: "active",
    cardNumber: 1,
    cardStamps: 0,
    contractCount: 0,
    availableRewards: 0,
    claimedRewards: 0,
    pendingContracts: 0,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
    ...overrides,
  };
}

export function buildPartnerOverview() {
  return {
    ...buildPartnerSummary(),
    partnerCode: "SPH-1042",
    rewardsEarned: 0,
    contracts: 0,
  };
}

export function buildLeads(count) {
  const statuses = ["new", "contacted", "follow_up", "visited", "contract", "closed", "spam"];
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => ({
    id: `lead-${index + 1}`,
    name: `مشتری نمونه ${index + 1}`,
    phone: `0912000${String(index).padStart(4, "0")}`,
    peopleCount: 3 + index,
    job: "کارمند",
    deal: index % 2 ? "رهن و اجاره" : "خرید",
    propertyType: "آپارتمان",
    neighborhood: ["چهارباغ", "مرداویج", "سپاهان‌شهر"][index % 3],
    floorPreference: "۳",
    requestedAmenities: ["parking", "elevator"],
    consultant: "آقای شیخ",
    note: index % 3 === 0 ? "تماس گرفته شد؛ منتظر تأیید بودجه." : "",
    status: statuses[index % statuses.length],
    createdAt: new Date(now - index * 3_600_000).toISOString(),
    source: "website",
    acquisitionSource: index % 2 ? "اینستاگرام" : null,
    acquisitionMedium: null,
    acquisitionCampaign: null,
    acquisitionReferrer: null,
    followUpAt: index % 3 === 0 ? new Date(now + index * 3_600_000).toISOString() : null,
    lastContactedAt: null,
    leaseDeadline: null,
    budgetDeposit: 500_000_000_000,
    budgetRent: 12_000_000,
    budgetPurchase: null,
    budgetSale: null,
    budgetDepositMin: 400_000_000_000,
    budgetDepositMax: 600_000_000_000,
    budgetRentMin: 10_000_000,
    budgetRentMax: 15_000_000,
    budgetPurchaseMin: null,
    budgetPurchaseMax: null,
    budgetSaleMin: null,
    budgetSaleMax: null,
    requestedBedrooms: 3,
    budgetEquivalent: 524_000_000_000,
    budgetBedrooms: 2,
    budgetRate: 10000000,
    matchCount: 3,
    matchedProperties: [
      {
        slug: "sample-one",
        title: "آپارتمان نمونه در چهارباغ",
        tier: "within",
        score: 90,
        suggestedDeposit: 450_000_000_000,
        suggestedRent: 11_000_000,
      },
    ],
  }));
}

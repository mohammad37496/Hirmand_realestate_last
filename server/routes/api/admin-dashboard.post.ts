import { createError, defineEventHandler, getCookie, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

type LeadStatus = "new" | "contacted" | "follow_up" | "visited" | "contract" | "closed" | "spam";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({
      statusCode: 401,
      statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید.",
    });
  }
  const claims = await getAdminSessionClaims(token);
  const role = normalizeAdminRole(claims?.role);
  if (!hasAdminPermission(role, "reports.view")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی گزارش برای این حساب فعال نیست." });
  }
  const canViewLeadDetails = hasAdminPermission(role, "lead.manage");

  if (dbSource === "unconfigured") {
    return {
      properties: { total: 0, published: 0, draft: 0, archived: 0, featured: 0, withoutImages: 0, newLast7: 0, incomplete: 0 },
      consultants: { total: 0, active: 0, withFiles: 0, withLeads: 0 },
      leads: { total: 0, new: 0, contacted: 0, follow_up: 0, visited: 0, contract: 0, closed: 0, spam: 0, today: 0, last7: 0, last30: 0 },
      propertyTypes: [],
      leadDays: [],
      music: { total: 0, active: 0, sizeBytes: 0 },
      visitors: { today: 0, last7: 0, last30: 0, pageviewsToday: 0, pageviewsLast7: 0, pageviewsLast30: 0, activeNow: 0 },
      visitorDays: [],
      topPages: [],
      topProperties: [],
      eventStats: [],
      visitorSources: [],
      followUps: { due: 0, next7: 0 },
      leadSla: { overdue: 0, newOver4Hours: 0 },
      recentLeads: [],
    };
  }

  const sql = await getSql();
  const [propertyStats, leadStats, propertyTypes, leadDays, musicStats, recentLeads, visitorStats, activeVisitorStats, visitorDays, topPages, topProperties, eventStats, visitorSources, followUps, consultantStats, consultantPerformance, leadSla] = await Promise.all([    sql.query<Record<string, unknown>>(
      `select
        count(*)::int as total,
        count(*) filter (where status = 'published')::int as published,
        count(*) filter (where status = 'draft')::int as draft,
        count(*) filter (where status = 'archived')::int as archived,
        count(*) filter (where featured = true)::int as featured,
        count(*) filter (where coalesce(jsonb_array_length(images), 0) = 0)::int as without_images,
        count(*) filter (where created_at >= current_timestamp - interval '7 days')::int as new_last7,
        count(*) filter (
          where coalesce(jsonb_array_length(images), 0) = 0
             or coalesce(length(trim(description)), 0) < 120
             or coalesce(trim(neighborhood), '') = ''
        )::int as incomplete
      from properties
    `),
    sql.query<Record<string, unknown>>(`
      select
        count(*)::int as total,
        count(*) filter (where status = 'new')::int as new,
        count(*) filter (where status = 'contacted')::int as contacted,
        count(*) filter (where status = 'follow_up')::int as follow_up,
        count(*) filter (where status = 'visited')::int as visited,
        count(*) filter (where status = 'contract')::int as contract,
        count(*) filter (where status = 'closed')::int as closed,
        count(*) filter (where status = 'spam')::int as spam,
        count(*) filter (
          where created_at >= (current_timestamp at time zone 'Asia/Tehran')::date
            at time zone 'Asia/Tehran'
        )::int as today,
        count(*) filter (
          where created_at >= current_timestamp - interval '7 days'
        )::int as last7,
        count(*) filter (
          where created_at >= current_timestamp - interval '30 days'
        )::int as last30
      from leads
    `),
    sql.query<Record<string, unknown>>(`
      select property_type, count(*)::int as count
      from properties
      group by property_type
      order by count desc
    `),
    sql.query<Record<string, unknown>>(`
      select (created_at at time zone 'Asia/Tehran')::date as day, count(*)::int as count
      from leads
      where created_at >= (
        ((current_timestamp at time zone 'Asia/Tehran')::date - 6)
        at time zone 'Asia/Tehran'
      )
      group by (created_at at time zone 'Asia/Tehran')::date
      order by day asc
    `),    sql.query<Record<string, unknown>>(
      `select
        count(*)::int as total,
        count(*) filter (where active = true)::int as active,
        coalesce(sum(size_bytes), 0)::bigint as size_bytes
       from music_tracks
    `),
    sql.query<Record<string, unknown>>(`
      select id, name, phone, deal, neighborhood, status, created_at
      from leads
      order by created_at desc
      limit 6
    `),
    sql.query<Record<string, unknown>>(`
      select
        count(*) filter (
          where day = (current_timestamp at time zone 'Asia/Tehran')::date
        )::int as today,
        count(distinct visitor_id) filter (
          where day >= (current_timestamp at time zone 'Asia/Tehran')::date - 6
        )::int as last7,
        count(distinct visitor_id) filter (
          where day >= (current_timestamp at time zone 'Asia/Tehran')::date - 29
        )::int as last30,
        coalesce(sum(pageviews) filter (
          where day = (current_timestamp at time zone 'Asia/Tehran')::date
        ), 0)::int as pageviews_today,
        coalesce(sum(pageviews) filter (
          where day >= (current_timestamp at time zone 'Asia/Tehran')::date - 6
        ), 0)::int as pageviews_last7,
        coalesce(sum(pageviews) filter (
          where day >= (current_timestamp at time zone 'Asia/Tehran')::date - 29
        ), 0)::int as pageviews_last30
      from site_visitor_days
    `).catch((error) => {
      console.error("[admin-dashboard] visitor stats unavailable", error);
      return [{}];
    }),
    sql.query<Record<string, unknown>>(`
      select count(distinct visitor_id)::int as active_now
      from site_visitor_days
      where last_seen_at >= current_timestamp - interval '5 minutes'
    `).catch((error) => {
      console.error("[admin-dashboard] active visitors unavailable", error);
      return [{}];
    }),
    sql.query<Record<string, unknown>>(`
      select
        ((current_timestamp at time zone 'Asia/Tehran')::date - days.n)::date as day,
        count(site_visitor_days.visitor_id)::int as unique_visitors,
        coalesce(sum(site_visitor_days.pageviews), 0)::int as pageviews
      from generate_series(0, 13) as days(n)
      left join site_visitor_days
        on site_visitor_days.day = ((current_timestamp at time zone 'Asia/Tehran')::date - days.n)
      group by days.n
      order by day asc
    `).catch((error) => {
      console.error("[admin-dashboard] visitor trend unavailable", error);
      return [];
    }),
    sql.query<Record<string, unknown>>(`
      select
        path,
        coalesce(sum(pageviews), 0)::int as pageviews,
        count(distinct visitor_id)::int as unique_visitors
      from site_page_days
      where day >= (current_timestamp at time zone 'Asia/Tehran')::date - 29
        and path not like '/api/%'
        and path not like '/admin%'
      group by path
      order by pageviews desc, unique_visitors desc
      limit 8
    `).catch((error) => {
      console.error("[admin-dashboard] top pages unavailable", error);
      return [];
    }),
    sql.query<Record<string, unknown>>(`
      select
        e.property_slug,
        p.title,
        p.neighborhood,
        count(*) filter (where e.event_name = 'property_view')::int as views,
        count(distinct e.visitor_id) filter (where e.event_name = 'property_view')::int as unique_views,
        count(*) filter (where e.event_name = 'call_click')::int as calls,
        count(*) filter (where e.event_name = 'whatsapp_click')::int as whatsapp,
        count(*) filter (where e.event_name = 'property_favorite')::int as favorites
      from site_events e
      left join properties p on p.slug = e.property_slug
      where e.day >= (current_timestamp at time zone 'Asia/Tehran')::date - 29
        and e.property_slug is not null
      group by e.property_slug, p.title, p.neighborhood
      having count(*) filter (where e.event_name = 'property_view') > 0
      order by views desc, unique_views desc
      limit 8
    `).catch((error) => {
      console.error("[admin-dashboard] top properties unavailable", error);
      return [];
    }),
    sql.query<Record<string, unknown>>(`
      select
        event_name,
        count(*)::int as count,
        count(distinct visitor_id)::int as unique_visitors
      from site_events
      where day >= (current_timestamp at time zone 'Asia/Tehran')::date - 29
      group by event_name
      order by count desc
    `).catch((error) => {
      console.error("[admin-dashboard] event stats unavailable", error);
      return [];
    }),
    sql.query<Record<string, unknown>>(`
      select
        coalesce(nullif(utm_source, ''), nullif(referrer_host, ''), 'direct') as source,
        coalesce(nullif(utm_campaign, ''), 'بدون کمپین') as campaign,
        count(distinct visitor_id)::int as visitors
      from site_visitor_days
      where day >= (current_timestamp at time zone 'Asia/Tehran')::date - 29
      group by 1, 2
      order by visitors desc
      limit 12
    `).catch((error) => {
      console.error("[admin-dashboard] visitor sources unavailable", error);
      return [];
    }),    sql.query<Record<string, unknown>>(
      `select
        count(*) filter (where status in ('new','contacted','follow_up','visited','contract') and follow_up_at <= current_timestamp)::int as due,
        count(*) filter (where status in ('new','contacted','follow_up','visited','contract') and follow_up_at > current_timestamp and follow_up_at <= current_timestamp + interval '7 days')::int as next7
      from leads
    `).catch((error) => {
      console.error("[admin-dashboard] follow-up stats unavailable", error);
      return [{}];
    }),
    sql.query<Record<string, unknown>>(
      `select
        (select count(*)::int from consultants) as total,
        (select count(*)::int from consultants where is_active = true) as active,
        (
          select count(*)::int
          from (
            select contact_name, contact_phone
            from properties
            where coalesce(trim(contact_name), '') <> ''
            group by contact_name, contact_phone
          ) assigned
          inner join consultants c
            on lower(c.name) = lower(assigned.contact_name)
            and c.phone = assigned.contact_phone
        ) as consultants_with_files,
        (
          select count(distinct lower(coalesce(consultant, '')))::int
          from leads
          where coalesce(trim(consultant), '') <> ''
        ) as consultants_with_leads
    `).catch((error) => {
      console.error("[admin-dashboard] consultant stats unavailable", error);
      return [{}];
    }),
    sql.query<Record<string, unknown>>(
      `select
         count(*) filter (
           where l.status in ('new','contacted','follow_up')
             and l.created_at < current_timestamp - interval '24 hours'
             and not exists (
               select 1 from lead_activities a
               where a.lead_id = l.id
                 and a.activity_type in ('call','whatsapp','visit')
             )
         )::int as overdue,
         count(*) filter (
           where l.status = 'new'
             and l.created_at < current_timestamp - interval '4 hours'
         )::int as new_over_4h
       from leads l`
    ).catch((error) => {
      console.error("[admin-dashboard] lead SLA unavailable", error);
      return [{}];
    }),
    sql.query<Record<string, unknown>>(
      `with file_stats as (
         select lower(trim(contact_name)) as key,
                count(*) filter (where status = 'published')::int as files
         from properties
         where coalesce(trim(contact_name), '') <> ''
         group by lower(trim(contact_name))
       ),
       lead_stats as (
         select lower(trim(consultant)) as key,
                count(*)::int as leads,
                count(*) filter (where status = 'contract')::int as contracts
         from leads
         where coalesce(trim(consultant), '') <> ''
           and created_at >= current_timestamp - interval '30 days'
         group by lower(trim(consultant))
       ),
       event_stats as (
         select lower(trim(p.contact_name)) as key,
                count(*) filter (where e.event_name = 'property_view')::int as views,
                count(*) filter (where e.event_name = 'call_click')::int as calls,
                count(*) filter (where e.event_name = 'whatsapp_click')::int as whatsapp
         from properties p
         join site_events e on e.property_slug = p.slug
         where coalesce(trim(p.contact_name), '') <> ''
           and e.day >= (current_timestamp at time zone 'Asia/Tehran')::date - 29
         group by lower(trim(p.contact_name))
       )
       select c.id, c.name, c.phone, c.is_active,
              coalesce(fs.files, 0)::int as files,
              coalesce(ls.leads, 0)::int as leads,
              coalesce(ls.contracts, 0)::int as contracts,
              coalesce(es.views, 0)::int as views,
              coalesce(es.calls, 0)::int as calls,
              coalesce(es.whatsapp, 0)::int as whatsapp
       from consultants c
       left join file_stats fs on fs.key = lower(trim(c.name))
       left join lead_stats ls on ls.key = lower(trim(c.name))
       left join event_stats es on es.key = lower(trim(c.name))
       where coalesce(fs.files, 0) > 0
          or coalesce(ls.leads, 0) > 0
          or coalesce(es.views, 0) > 0
       order by leads desc, views desc, files desc, name asc
       limit 12
      `).catch((error) => {
      console.error("[admin-dashboard] consultant performance unavailable", error);
      return [] as Record<string, unknown>[];
    }),
  ]);
  const p = propertyStats[0] ?? {};
  const l = leadStats[0] ?? {};
  const m = musicStats[0] ?? {};
  const v = (visitorStats[0] ?? {}) as Record<string, unknown>;
  const active = (activeVisitorStats[0] ?? {}) as Record<string, unknown>;
  const followUp = (followUps[0] ?? {}) as Record<string, unknown>;
  const c = (consultantStats[0] ?? {}) as Record<string, unknown>;

  return {
    properties: {
      total: Number(p.total) || 0,
      published: Number(p.published) || 0,
      draft: Number(p.draft) || 0,
      archived: Number(p.archived) || 0,
      featured: Number(p.featured) || 0,
      withoutImages: Number(p.without_images) || 0,
      newLast7: Number(p.new_last7) || 0,
      incomplete: Number(p.incomplete) || 0,
    },
    consultants: {
      total: Number(c.total) || 0,
      active: Number(c.active) || 0,
      withFiles: Number(c.consultants_with_files) || 0,
      withLeads: Number(c.consultants_with_leads) || 0,
    },
    leads: {
      total: Number(l.total) || 0,
      new: Number(l.new) || 0,
      contacted: Number(l.contacted) || 0,
      follow_up: Number(l.follow_up) || 0,
      visited: Number(l.visited) || 0,
      contract: Number(l.contract) || 0,
      closed: Number(l.closed) || 0,
      spam: Number(l.spam) || 0,
      today: Number(l.today) || 0,
      last7: Number(l.last7) || 0,
      last30: Number(l.last30) || 0,
    },
    propertyTypes: propertyTypes.map((row) => ({
      type: String(row.property_type ?? "other"),
      count: Number(row.count) || 0,
    })),
    leadDays: leadDays.map((row) => ({
      day: new Date(String(row.day)).toISOString().slice(0, 10),
      count: Number(row.count) || 0,
    })),
    music: {
      total: Number(m.total) || 0,
      active: Number(m.active) || 0,
      sizeBytes: Number(m.size_bytes) || 0,
    },
    visitors: {
      today: Number(v.today) || 0,
      last7: Number(v.last7) || 0,
      last30: Number(v.last30) || 0,
      pageviewsToday: Number(v.pageviews_today) || 0,
      pageviewsLast7: Number(v.pageviews_last7) || 0,
      pageviewsLast30: Number(v.pageviews_last30) || 0,
      activeNow: Number(active.active_now) || 0,
    },
    visitorDays: visitorDays.map((row) => ({
      day: String(row.day).slice(0, 10),
      uniqueVisitors: Number(row.unique_visitors) || 0,
      pageviews: Number(row.pageviews) || 0,
    })),
    topPages: topPages.map((row) => ({
      path: String(row.path),
      pageviews: Number(row.pageviews) || 0,
      uniqueVisitors: Number(row.unique_visitors) || 0,
    })),
    topProperties: topProperties.map((row) => ({
      slug: String(row.property_slug),
      title: String(row.title ?? "فایل حذف‌شده"),
      neighborhood: String(row.neighborhood ?? ""),
      views: Number(row.views) || 0,
      uniqueViews: Number(row.unique_views) || 0,
      calls: Number(row.calls) || 0,
      whatsapp: Number(row.whatsapp) || 0,
      favorites: Number(row.favorites) || 0,
    })),
    eventStats: eventStats.map((row) => ({
      event: String(row.event_name),
      count: Number(row.count) || 0,
      uniqueVisitors: Number(row.unique_visitors) || 0,
    })),
    visitorSources: visitorSources.map((row) => ({
      source: String(row.source),
      campaign: String(row.campaign),
      visitors: Number(row.visitors) || 0,
    })),
    followUps: {
      due: Number(followUp.due) || 0,
      next7: Number(followUp.next7) || 0,
    },
    leadSla: {
      overdue: Number((leadSla[0] ?? {}).overdue) || 0,
      newOver4Hours: Number((leadSla[0] ?? {}).new_over_4h) || 0,
    },
    consultantPerformance: (consultantPerformance as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      phone: canViewLeadDetails ? String(row.phone ?? "") : "",
      active: Boolean(row.is_active),
      files: Number(row.files) || 0,
      leads: Number(row.leads) || 0,
      contracts: Number(row.contracts) || 0,
      views: Number(row.views) || 0,
      calls: Number(row.calls) || 0,
      whatsapp: Number(row.whatsapp) || 0,
    })),
    recentLeads: canViewLeadDetails ? recentLeads.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      phone: String(row.phone),
      deal: String(row.deal),
      neighborhood: String(row.neighborhood ?? ""),
      status: String(row.status) as LeadStatus,
      createdAt: new Date(String(row.created_at)).toISOString(),
    })) : [],
  };
});

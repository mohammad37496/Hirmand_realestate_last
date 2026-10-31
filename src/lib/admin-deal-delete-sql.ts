export const DELETE_ADMIN_DEAL_WITH_DOCUMENTS_SQL = `
  with eligible_deal as materialized (
    select d.id
    from admin_deals d
    where d.id=$1
      and not exists (select 1 from admin_commission_settlements s where s.deal_id=d.id)
    for update
  ),
  removed_documents as (
    delete from admin_deal_documents d
    where d.deal_id=$1 and exists (select 1 from eligible_deal)
    returning d.file_url
  ),
  deleted_deal as (
    delete from admin_deals d
    where d.id=$1
      and exists (select 1 from eligible_deal)
      and (select count(*) from removed_documents) >= 0
    returning d.id
  )
  select
    (select id from deleted_deal) as id,
    coalesce(
      (select array_agg(distinct file_url) filter (where nullif(trim(file_url),'') is not null) from removed_documents),
      array[]::text[]
    ) as file_urls
`;

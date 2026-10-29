export const REORDER_MUSIC_TRACKS_SQL = `
  with locked_tracks as materialized (
    select id from music_tracks for update
  ), requested as materialized (
    select id, ordinality::int - 1 as position
    from unnest($1::text[]) with ordinality as input(id, ordinality)
  ), validation as materialized (
    select
      exists (select 1 from requested group by id having count(*) > 1) as has_duplicates,
      (select count(*) from requested) = (select count(*) from locked_tracks) as matches_track_count,
      exists (select 1 from requested r left join locked_tracks t on t.id=r.id where t.id is null) as has_unknown_ids
  ), updated as (
    update music_tracks track
    set position=requested.position, updated_at=current_timestamp
    from requested, locked_tracks, validation
    where track.id=requested.id
      and locked_tracks.id=track.id
      and not validation.has_duplicates
      and validation.matches_track_count
      and not validation.has_unknown_ids
    returning track.id
  )
  select
    (select count(*)::int from requested) as requested_count,
    (select count(*)::int from updated) as updated_count,
    (select count(*)::int from locked_tracks) as total_count,
    (select has_duplicates from validation) as has_duplicates,
    (select matches_track_count from validation) as matches_track_count,
    (select has_unknown_ids from validation) as has_unknown_ids
`;

import { prisma } from "../../../db/client.js";

export type TrendingRow = {
  id: string;
  title: string;
  createdAt: Date;
  likeCount: number;
  viewCount: number;
  shareCount: number;
  score: number;
};

/**
 * score = (likes*3 + views*1 + shares*5) / (hoursSinceLastActivity + 2)^1.5
 *
 * ponytail: full aggregate per request, no cache/snapshot table. Fine while the
 * trips table is small; swap for a periodic trending_snapshots table when the
 * scan starts to hurt.
 */
export async function listTrending(limit: number): Promise<TrendingRow[]> {
  return prisma.$queryRaw<TrendingRow[]>`
    WITH likes AS (
      SELECT trip_id, count(*)::int AS n, max(created_at) AS last_at
      FROM trip_likes GROUP BY trip_id
    ), views AS (
      SELECT trip_id, count(*)::int AS n, max(viewed_at) AS last_at
      FROM trip_views GROUP BY trip_id
    ), shares AS (
      SELECT trip_id, count(*)::int AS n, max(created_at) AS last_at
      FROM trip_shares GROUP BY trip_id
    )
    SELECT
      t.id,
      t.title,
      t.created_at AS "createdAt",
      COALESCE(l.n, 0)::int AS "likeCount",
      COALESCE(v.n, 0)::int AS "viewCount",
      COALESCE(s.n, 0)::int AS "shareCount",
      (
        COALESCE(l.n, 0) * 3 + COALESCE(v.n, 0) + COALESCE(s.n, 0) * 5
      )::float8 / POWER(
        EXTRACT(EPOCH FROM (
          now() - GREATEST(
            t.created_at,
            COALESCE(l.last_at, t.created_at),
            COALESCE(v.last_at, t.created_at),
            COALESCE(s.last_at, t.created_at)
          )
        )) / 3600.0 + 2,
        1.5
      ) AS "score"
    FROM trips t
    LEFT JOIN likes l ON l.trip_id = t.id
    LEFT JOIN views v ON v.trip_id = t.id
    LEFT JOIN shares s ON s.trip_id = t.id
    WHERE t.is_public AND t.deleted_at IS NULL
    ORDER BY "score" DESC, t.created_at DESC
    LIMIT ${limit}
  `;
}

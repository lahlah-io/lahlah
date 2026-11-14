import { useCallback, useEffect, useRef, useState } from "react";

import * as homeApi from "../services/home.api";
import type { FeedCardDto } from "../services/home.api";

const PAGE_SIZE = 12;

const INITIAL_PAGE = 1;

/**
 * Feed beranda: `GET /itineraries/feed` per halaman.
 *
 * `items === null` berarti halaman pertama belum termuat. Like diubah optimistis
 * lalu dikoreksi dengan angka dari API; kegagalannya dikembalikan ke nilai lama.
 */
export function useFeed() {
  const [items, setItems] = useState<FeedCardDto[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const pageRef = useRef(INITIAL_PAGE);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    busyRef.current = true;

    homeApi
      .listFeed({ limit: PAGE_SIZE, page: INITIAL_PAGE })
      .then((page) => {
        if (cancelled) return;
        pageRef.current = INITIAL_PAGE;
        setItems(page.data);
        setHasMore(page.meta.hasMore);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        // Daftar kosong supaya home keluar dari status loading meski gagal.
        setItems((current) => current ?? []);
        setError(homeApi.errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) busyRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const loadMore = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoadingMore(true);

    try {
      const next = await homeApi.listFeed({
        limit: PAGE_SIZE,
        page: pageRef.current + 1,
      });
      pageRef.current += 1;
      setItems((current) => [...(current ?? []), ...next.data]);
      setHasMore(next.meta.hasMore);
      setError(null);
    } catch (cause) {
      setError(homeApi.errorMessage(cause));
    } finally {
      busyRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  const toggleLike = useCallback(async (tripId: string, liked: boolean) => {
    const apply = (nextLiked: boolean, likeCount?: number) => {
      setItems(
        (current) =>
          current?.map((item) =>
            item.id === tripId
              ? {
                  ...item,
                  likedByMe: nextLiked,
                  likeCount: likeCount ?? item.likeCount + (nextLiked ? 1 : -1),
                }
              : item,
          ) ?? current,
      );
    };

    apply(liked);
    try {
      const result = liked
        ? await homeApi.likeItinerary(tripId)
        : await homeApi.unlikeItinerary(tripId);
      apply(result.data.liked, result.data.likeCount);
    } catch (cause) {
      apply(!liked);
      setError(homeApi.errorMessage(cause));
    }
  }, []);

  const reload = useCallback(() => {
    setItems(null);
    setNonce((value) => value + 1);
  }, []);

  return {
    error,
    hasMore,
    items,
    loading: items === null,
    loadingMore,
    loadMore,
    reload,
    toggleLike,
  };
}

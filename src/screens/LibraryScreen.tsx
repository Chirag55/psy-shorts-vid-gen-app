import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Badge, Body, Button, Card, Empty, H2, Row, Segmented, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { getKey, setKey } from '@/services/keys';
import {
  ensureFreshToken,
  fetchMyChannel,
  fetchUploadsPage,
  shortsUrl,
  watchUrl,
  type ChannelSummary,
  type StoredTokens,
} from '@/services/youtube';
import {
  formatCount,
  formatDuration,
  formatPublished,
  isLikelyShort,
  type UploadedVideo,
} from '@/core/youtubeLibrary';
import { useMounted } from '@/util/useMounted';

type Filter = 'shorts' | 'all';

/**
 * What the channel has actually published, read back from the YouTube Data API.
 *
 * Paged rather than loaded whole: a channel with hundreds of uploads would
 * otherwise cost a large multiple of the daily quota on every open.
 */
export default function LibraryScreen() {
  const mounted = useMounted();

  const [channel, setChannel] = useState<ChannelSummary | null>(null);
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [filter, setFilter] = useState<Filter>('shorts');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  /** Returns a valid access token, refreshing and re-persisting it if needed. */
  const accessToken = useCallback(async (): Promise<string | null> => {
    const raw = await getKey('youtubeTokens');
    const clientId = await getKey('youtubeClientId');
    if (!raw || !clientId) return null;

    const fresh = await ensureFreshToken(clientId, JSON.parse(raw) as StoredTokens);
    await setKey('youtubeTokens', JSON.stringify(fresh));
    return fresh.accessToken;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await accessToken();
      if (!token) {
        if (mounted.current) setSignedIn(false);
        return;
      }
      if (mounted.current) setSignedIn(true);

      const summary = await fetchMyChannel(token);
      const page = await fetchUploadsPage(token, summary.uploadsPlaylistId);

      if (!mounted.current) return;
      setChannel(summary);
      setVideos(page.videos);
      setNextPageToken(page.nextPageToken);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [accessToken, mounted]);

  const loadMore = useCallback(async () => {
    if (!channel || !nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const token = await accessToken();
      if (!token) return;
      const page = await fetchUploadsPage(token, channel.uploadsPlaylistId, nextPageToken);
      if (!mounted.current) return;
      // Guard against a duplicate page if the user scrolls fast.
      setVideos((prev) => {
        const seen = new Set(prev.map((v) => v.videoId));
        return [...prev, ...page.videos.filter((v) => !seen.has(v.videoId))];
      });
      setNextPageToken(page.nextPageToken);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }, [accessToken, channel, nextPageToken, loadingMore, mounted]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = filter === 'shorts' ? videos.filter(isLikelyShort) : videos;

  if (signedIn === false) {
    return (
      <View style={s.root}>
        <View style={{ padding: space.lg }}>
          <Card>
            <H2>Not connected</H2>
            <Small>
              Connect your channel on the Publish screen of any project, then come back here to see
              everything you have uploaded.
            </Small>
          </Card>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <FlatList
        data={shown}
        keyExtractor={(v) => v.videoId}
        numColumns={2}
        columnWrapperStyle={{ gap: space.md }}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.md }}>
            {channel ? (
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <H2>{channel.title}</H2>
                    <Small>
                      {formatCount(channel.subscriberCount)} subscribers · {channel.videoCount} uploads ·{' '}
                      {formatCount(channel.viewCount)} views
                    </Small>
                  </View>
                  {channel.thumbnailUrl ? (
                    <Image source={{ uri: channel.thumbnailUrl }} style={s.avatar} />
                  ) : null}
                </Row>
              </Card>
            ) : null}

            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'shorts', label: `Shorts (${videos.filter(isLikelyShort).length})` },
                { value: 'all', label: `All (${videos.length})` },
              ]}
            />

            {error ? (
              <Card>
                <Body style={{ color: colors.danger, fontSize: 13 }}>{error}</Body>
                <Button label="Try again" variant="secondary" onPress={load} />
              </Card>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <Empty
              title={filter === 'shorts' ? 'No Shorts found' : 'Nothing uploaded yet'}
              hint={
                filter === 'shorts'
                  ? 'Shorts are identified by runtime — anything three minutes or under. Switch to All to see every upload.'
                  : 'Publish something from a project and it will appear here.'
              }
            />
          )
        }
        ListFooterComponent={
          nextPageToken ? (
            <View style={{ paddingVertical: space.lg }}>
              <Button
                label={loadingMore ? 'Loading…' : 'Load more'}
                variant="ghost"
                loading={loadingMore}
                onPress={loadMore}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => <VideoCard video={item} />}
      />
    </View>
  );
}

function VideoCard({ video }: { video: UploadedVideo }) {
  const short = isLikelyShort(video);
  const open = () => void Linking.openURL(short ? shortsUrl(video.videoId) : watchUrl(video.videoId));

  return (
    <Pressable onPress={open} style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}>
      <View style={[s.thumbWrap, { aspectRatio: short ? 9 / 16 : 16 / 9 }]}>
        {video.thumbnailUrl ? (
          <Image source={{ uri: video.thumbnailUrl }} style={s.thumb} resizeMode="cover" />
        ) : (
          <View style={[s.thumb, { backgroundColor: colors.surfaceAlt }]} />
        )}
        <View style={s.durationPill}>
          <Text style={s.durationText}>{formatDuration(video.durationSeconds)}</Text>
        </View>
        {video.privacyStatus !== 'public' ? (
          <View style={s.privacyPill}>
            <Text style={s.privacyText}>{video.privacyStatus.toUpperCase()}</Text>
          </View>
        ) : null}
      </View>

      <Text style={s.title} numberOfLines={2}>
        {video.title}
      </Text>
      <Small>
        {formatCount(video.viewCount)} views · {formatPublished(video.publishedAt)}
      </Small>
      <Row style={{ marginTop: 2 }}>
        <Small>♥ {formatCount(video.likeCount)}</Small>
        <Small>· 💬 {formatCount(video.commentCount)}</Small>
      </Row>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { padding: space.lg, paddingBottom: space.xxl * 2, gap: space.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceAlt },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
    gap: 4,
  },
  thumbWrap: {
    width: '100%',
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 4,
  },
  thumb: { width: '100%', height: '100%' },
  durationPill: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(5,7,11,0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  privacyPill: {
    position: 'absolute',
    left: 6,
    top: 6,
    backgroundColor: 'rgba(5,7,11,0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  privacyText: { color: colors.warn, fontSize: 9, fontWeight: '800' },
  title: { color: colors.text, fontSize: 13, fontWeight: '600', lineHeight: 17 },
});

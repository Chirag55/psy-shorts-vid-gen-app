import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Badge, Body, Button, Card, Empty, H2, Row, Segmented, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { getKey, setKey } from '@/services/keys';
import { useStudio } from '@/store';
import {
  ensureFreshToken,
  fetchChannel,
  fetchUploadsPage,
  shortsUrl,
  SignInExpiredError,
  watchUrl,
  type ChannelSummary,
  type StoredTokens,
  type YouTubeAuth,
} from '@/services/youtube';
import {
  formatCount,
  formatDuration,
  formatPublished,
  isLikelyShort,
  isScheduled,
  type UploadedVideo,
} from '@/core/youtubeLibrary';
import { AB_MIN_PER_VARIANT, compareVariants, feedShare, feedViewedPercent, type VideoAnalytics } from '@/core/analytics';
import { formatSlot } from '@/core/slots';
import { AnalyticsError, refreshAnalytics } from '@/services/youtubeAnalytics';
import { stayedCell } from '@/core/hookLog';
import { partnerLine } from '@/core/ypp';
import { badgeFor, stateOfUpload, studioLink, type Badge as UploadBadge } from '@/core/publishVerify';
import { backfillReleases, runReleaseChecks } from '@/services/releaseWatch';
import { auditSeo, focusKeyword } from '@/core/seo';
import { SIGN_IN_EXPIRED_MESSAGE } from '@/core/oauth';
import type { RootStackParamList } from '@/navigation/types';
import { useMounted } from '@/util/useMounted';

type Filter = 'shorts' | 'all';
type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * What the channel has actually published, read back from the YouTube Data API.
 *
 * Paged rather than loaded whole: a channel with hundreds of uploads would
 * otherwise cost a large multiple of the daily quota on every open.
 */
export default function LibraryScreen() {
  const nav = useNavigation<Nav>();
  const mounted = useMounted();

  const [channel, setChannel] = useState<ChannelSummary | null>(null);
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [filter, setFilter] = useState<Filter>('shorts');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [analyticsNote, setAnalyticsNote] = useState<string | null>(null);
  const analytics = useStudio((s) => s.analytics);
  const mergeAnalytics = useStudio((s) => s.mergeAnalytics);
  const projects = useStudio((s) => s.projects);
  const ypp = useStudio((s) => s.ypp);
  const recordChannelUploads = useStudio((s) => s.recordChannelUploads);
  const releaseWatch = useStudio((s) => s.releaseWatch);
  const verification = useStudio((s) => s.channelConfig.verification);
  const [checkResult, setCheckResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  /** Uploads the scheduler must not collide with: public ones by publish time, scheduled ones by their slot. */
  const recordUploads = useCallback(
    (list: UploadedVideo[]) => {
      const rows = list.flatMap((v) => {
        const at = isScheduled(v) ? v.scheduledFor : v.privacyStatus === 'public' ? v.publishedAt : undefined;
        if (!at) return [];
        return [{ videoId: v.videoId, title: v.title, kind: isLikelyShort(v) ? 'short' : 'long', at }];
      });
      if (rows.length) recordChannelUploads(rows);
    },
    [recordChannelUploads],
  );

  const checkAll = async () => {
    setChecking(true);
    try {
      const result = await backfillReleases();
      if (mounted.current) setCheckResult(result);
      runReleaseChecks();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setChecking(false);
    }
  };

  /** Retention and subscribers per video need the owner's sign-in; an API key only sees public counts. */
  const refreshStats = useCallback(
    async (auth: YouTubeAuth, list: UploadedVideo[]) => {
      if (auth.kind === 'oauth') {
        try {
          const rows = await refreshAnalytics(auth.accessToken, list, useStudio.getState().analytics);
          if (Object.keys(rows).length) mergeAnalytics(rows);
          if (mounted.current) setAnalyticsNote(null);
        } catch (e) {
          if (mounted.current) {
            setAnalyticsNote(e instanceof AnalyticsError ? e.message : `Analytics unavailable: ${String(e)}`);
          }
        }
      } else if (mounted.current) {
        setAnalyticsNote('Sign in with Google in Settings to see retention and subscribers gained per video.');
      }
    },
    [mergeAnalytics, mounted],
  );

  /**
   * Resolves however the channel is reachable.
   *
   * OAuth is preferred when present because it also sees unlisted and private
   * uploads; an API key is the zero-sign-in fallback for public data, and keeps
   * the list readable when the sign-in has expired.
   */
  const resolveAuth = useCallback(async (): Promise<YouTubeAuth | null> => {
    const raw = await getKey('youtubeTokens');
    const clientId = await getKey('youtubeClientId');

    if (raw && clientId) {
      try {
        const fresh = await ensureFreshToken(clientId, JSON.parse(raw) as StoredTokens);
        await setKey('youtubeTokens', JSON.stringify(fresh));
        if (mounted.current) setSessionExpired(false);
        return { kind: 'oauth', accessToken: fresh.accessToken };
      } catch (e) {
        if (!(e instanceof SignInExpiredError)) throw e;
        if (mounted.current) setSessionExpired(true);
      }
    }

    const apiKey = await getKey('youtubeApiKey');
    const channelId = useStudio.getState().settings.youtubeChannelId;
    if (apiKey && channelId) return { kind: 'apiKey', apiKey, channelId };

    return null;
  }, [mounted]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await resolveAuth();
      if (!auth) {
        if (mounted.current) setSignedIn(false);
        return;
      }
      if (mounted.current) setSignedIn(true);

      const summary = await fetchChannel(auth);
      const page = await fetchUploadsPage(auth, summary.uploadsPlaylistId);

      if (!mounted.current) return;
      setChannel(summary);
      setVideos(page.videos);
      recordUploads(page.videos);
      setNextPageToken(page.nextPageToken);
      void refreshStats(auth, page.videos);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [resolveAuth, mounted, refreshStats, recordUploads]);

  const loadMore = useCallback(async () => {
    if (!channel || !nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const auth = await resolveAuth();
      if (!auth) return;
      const page = await fetchUploadsPage(auth, channel.uploadsPlaylistId, nextPageToken);
      if (!mounted.current) return;
      // Guard against a duplicate page if the user scrolls fast.
      setVideos((prev) => {
        const seen = new Set(prev.map((v) => v.videoId));
        return [...prev, ...page.videos.filter((v) => !seen.has(v.videoId))];
      });
      setNextPageToken(page.nextPageToken);
      recordUploads(page.videos);
      void refreshStats(auth, page.videos);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }, [resolveAuth, channel, nextPageToken, loadingMore, mounted, refreshStats, recordUploads]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = filter === 'shorts' ? videos.filter(isLikelyShort) : videos;
  const scheduled = videos
    .filter((v) => isScheduled(v))
    .sort((a, b) => new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime());
  const variants = compareVariants(
    projects.flatMap((p: any) => {
      const variant = p.assets.mascotVariant;
      const stats = p.assets.youtubeVideoId ? analytics[p.assets.youtubeVideoId] : undefined;
      return (variant === 'start' || variant === 'delayed') && stats ? [{ variant, analytics: stats }] : [];
    }),
  );

  const expiredCard = sessionExpired ? (
    <Card>
      <Body style={{ color: colors.warn, fontSize: 13 }}>{SIGN_IN_EXPIRED_MESSAGE}</Body>
      {signedIn ? (
        <Small>Showing public videos through the API key meanwhile; private and scheduled ones need the sign-in.</Small>
      ) : null}
      <Button label="Open Settings to sign in" variant="secondary" onPress={() => nav.navigate('Settings' as never)} />
    </Card>
  ) : null;

  if (signedIn === false) {
    return (
      <View style={s.root}>
        <View style={{ padding: space.lg, gap: space.md }}>
          {expiredCard}
          <Card>
            <H2>Not connected</H2>
            <Small>
              Two ways to connect, both in Settings: add a YouTube API key and your channel ID to browse public uploads
              with no sign-in, or sign in with Google to also see unlisted and private videos and publish from the
              app.
            </Small>
          </Card>
        </View>
      </View>
    );
  }

  const releaseAlerts = Object.values(releaseWatch).filter((w: any) => w.alerts.length);

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
                  {channel.thumbnailUrl ? <Image source={{ uri: channel.thumbnailUrl }} style={s.avatar} /> : null}
                </Row>
                <Button
                  label="Update titles, descriptions & tags from a file"
                  variant="ghost"
                  onPress={() => nav.navigate('MetadataUpdate')}
                />
                <Button
                  label={checking ? 'Checking every video…' : "Check every video's status"}
                  variant="ghost"
                  loading={checking}
                  onPress={() => void checkAll()}
                />
              </Card>
            ) : null}

            <Card>
              <H2>Partner Programme progress (estimate)</H2>
              {partnerLine(ypp.snapshot, ypp.manual, new Date()).map((line) => (
                <Small key={line}>{line}</Small>
              ))}
              <Small style={{ color: colors.textFaint }}>
                An estimate from the YouTube APIs (CR-88A). Studio's Earn tab is the authority; confirm the thresholds
                there.
              </Small>
              <Button label="Open the YPP dashboard" variant="ghost" onPress={() => nav.navigate('Ypp')} />
            </Card>

            {checkResult ? (
              <Card>
                <H2>Status check</H2>
                <Small>
                  {checkResult.scanned} uploads checked.{' '}
                  {checkResult.rows.length
                    ? `${checkResult.rows.length} need a look:`
                    : 'Every one is public or scheduled, and being served.'}
                </Small>
                {checkResult.rows.map((r: any) => (
                  <View key={r.videoId} style={{ gap: 2, marginTop: space.xs }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={s.queueTitle} numberOfLines={1}>
                        {r.title}
                      </Text>
                      <Badge
                        label={r.badge.toUpperCase()}
                        tone={
                          r.badge === 'Public'
                            ? 'ok'
                            : r.badge === 'Stuck' || r.badge === 'Restricted'
                              ? 'danger'
                              : r.badge === 'Scheduled'
                                ? 'neutral'
                                : 'warn'
                        }
                      />
                    </Row>
                    <Small>{r.reason}</Small>
                    <Pressable onPress={() => void Linking.openURL(studioLink(r.videoId))} hitSlop={6}>
                      <Small style={{ color: colors.accent, fontWeight: '800' }}>Open in Studio ›</Small>
                    </Pressable>
                  </View>
                ))}
                <Small style={{ color: colors.textFaint }}>
                  The API can't read Studio's Checks (copyright, ad suitability). Nothing is deleted or re-uploaded: that
                  can look like duplicate content.
                </Small>
              </Card>
            ) : null}

            {releaseAlerts.length ? (
              <Card>
                <H2>Release checks</H2>
                {releaseAlerts
                  .sort((a: any, b: any) => b.publicAt.localeCompare(a.publicAt))
                  .slice(0, 5)
                  .map((w: any) => (
                    <View key={w.videoId} style={{ gap: 2, marginTop: space.xs }}>
                      {w.alerts.map((a: any) => (
                        <Small
                          key={a.stage}
                          style={{
                            color: a.level === 'danger' ? colors.danger : a.level === 'warn' ? colors.warn : colors.textDim,
                          }}
                        >
                          • {a.title}. {a.body}
                        </Small>
                      ))}
                    </View>
                  ))}
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

            {scheduled.length ? (
              <Card>
                <H2>Scheduled</H2>
                {scheduled.map((v) => (
                  <Row key={v.videoId} style={{ justifyContent: 'space-between' }}>
                    <Text style={s.queueTitle} numberOfLines={1}>
                      {v.title}
                    </Text>
                    <Small>{formatSlot(new Date(v.scheduledFor!))}</Small>
                  </Row>
                ))}
              </Card>
            ) : null}

            {variants.length ? (
              <Card>
                <H2>Hoot entry test</H2>
                {variants.map((v) => (
                  <Row key={v.variant} style={{ justifyContent: 'space-between' }}>
                    <Small style={{ color: colors.text }}>
                      {v.variant === 'delayed' ? 'Enters at 2 s' : 'From the first frame'}
                    </Small>
                    <Small>
                      {v.shorts} Short{v.shorts === 1 ? '' : 's'} ·{' '}
                      {v.avgFeedViewedPct !== undefined ? `feed ${Math.round(v.avgFeedViewedPct)}% viewed` : 'no feed data'} · +
                      {v.avgSubscribersGained.toFixed(1)} subs avg
                    </Small>
                  </Row>
                ))}
                <Small>
                  {variants.every((v) => v.shorts >= AB_MIN_PER_VARIANT) && variants.length === 2
                    ? 'Both variants have enough Shorts to compare.'
                    : `Read this once each variant has about ${AB_MIN_PER_VARIANT} Shorts; before that the difference is noise.`}
                </Small>
              </Card>
            ) : null}

            {expiredCard}

            {analyticsNote ? (
              <Card>
                <Small style={{ color: colors.warn }}>{analyticsNote}</Small>
              </Card>
            ) : null}

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
              <Button label={loadingMore ? 'Loading…' : 'Load more'} variant="ghost" loading={loadingMore} onPress={loadMore} />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <VideoCard
            video={item}
            badge={badgeFor(stateOfUpload(item), new Date(), verification)}
            stats={analytics[item.videoId]}
            onAudit={() => nav.navigate('SeoAudit', { videoId: item.videoId, short: isLikelyShort(item) })}
          />
        )}
      />
    </View>
  );
}

const BADGE_COLORS: Record<UploadBadge, string> = {
  Public: colors.ok,
  Scheduled: colors.accent,
  Private: colors.warn,
  Unlisted: colors.warn,
  Processing: colors.warn,
  Stuck: colors.danger,
  Restricted: colors.danger,
};

function VideoCard({
  video,
  badge,
  stats,
  onAudit,
}: {
  video: UploadedVideo;
  badge: UploadBadge;
  stats?: VideoAnalytics;
  onAudit: () => void;
}) {
  const project = useStudio((s) => s.projects.find((p) => p.assets.youtubeVideoId === video.videoId));
  const stayed = project && project.mode === 'short' ? stayedCell(project) : undefined;
  const feed = stats ? feedViewedPercent(stats) : undefined;
  const short = isLikelyShort(video);
  const audit = video.tags
    ? auditSeo(
        { title: video.title, description: video.description, tags: video.tags },
        {
          mode: short ? 'short' : 'long',
          keyword: focusKeyword({ tags: video.tags, text: `${video.title}\n${video.description.slice(0, 150)}` }),
        },
      )
    : null;
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
        <View style={s.privacyPill}>
          <Text style={[s.privacyText, { color: BADGE_COLORS[badge] }]}>{badge.toUpperCase()}</Text>
        </View>
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
      <Pressable onPress={onAudit} hitSlop={6}>
        <Small
          style={{
            color: audit ? (audit.score >= 90 ? colors.ok : audit.score >= 70 ? colors.warn : colors.danger) : colors.accent,
            fontWeight: '800',
          }}
        >
          {audit ? `SEO ${audit.score}/100 · Audit ›` : 'SEO audit ›'}
        </Small>
      </Pressable>
      {stayed ? (
        <Small
          style={{
            color:
              stayed.tone === 'ok'
                ? colors.ok
                : stayed.tone === 'warn'
                  ? colors.warn
                  : stayed.tone === 'danger'
                    ? colors.danger
                    : colors.textFaint,
            fontWeight: '800',
          }}
        >
          {stayed.label}
          {project?.style ? ` · ${project.style.profile}` : ''}
        </Small>
      ) : null}
      {stats ? (
        <View style={{ gap: 1 }}>
          <Small style={{ color: stats.subscribersGained > 0 ? colors.ok : colors.textDim }}>
            +{stats.subscribersGained} sub{stats.subscribersGained === 1 ? '' : 's'} ·{' '}
            {Math.round(stats.averageViewPercentage)}% viewed
          </Small>
          {feed !== undefined ? (
            <Small style={{ color: feed < 50 ? colors.warn : colors.textDim }}>
              Feed {Math.round(feed)}% viewed · {Math.round(feedShare(stats) * 100)}% of views from feed
            </Small>
          ) : null}
        </View>
      ) : null}
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
  queueTitle: { flex: 1, color: colors.text, fontSize: 12, marginRight: 8 },
});

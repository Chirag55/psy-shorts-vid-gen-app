import React, { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { Badge, Button, Card, Empty, Field, H2, H3, ProgressBar, Row, Screen, Segmented, Small } from '@/components/ui';
import { colors, space } from '@/theme';
import { useStudio } from '@/store';
import { getKey, setKey } from '@/services/keys';
import { authorize, ensureFreshToken, setThumbnail, uploadVideo, watchUrl, type StoredTokens } from '@/services/youtube';
import { buildDescription } from '@/core/timestamps';
import type { LongScript, ShortScript } from '@/core/types';
import type { RootStackParamList } from '@/navigation/types';

export default function PublishScreen() {
  const { id } = useRoute<RouteProp<RootStackParamList, 'Publish'>>().params;
  const project = useStudio((s) => s.projects.find((p) => p.id === id));
  const updateProject = useStudio((s) => s.updateProject);
  const patchAssets = useStudio((s) => s.patchAssets);

  const [clientId, setClientId] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [title, setTitle] = useState(project?.publish.title ?? '');
  const [description, setDescription] = useState(project?.publish.description ?? '');
  const [tags, setTags] = useState(project?.publish.tags ?? '');
  const [privacy, setPrivacy] = useState(project?.publish.privacyStatus ?? 'private');

  useEffect(() => {
    void (async () => {
      setClientId((await getKey('youtubeClientId')) ?? '');
      setSignedIn(Boolean(await getKey('youtubeTokens')));
    })();
  }, []);

  // Seed the description from the chapter timestamps the first time this opens.
  useEffect(() => {
    if (!project || description) return;
    if (project.mode === 'long') {
      const durations = Object.fromEntries(
        Object.entries(project.assets.alignment).map(([k, words]) => [k, words.length ? words[words.length - 1].end : 0])
      );
      setDescription(buildDescription(project.script as LongScript, durations));
    } else {
      const script = project.script as ShortScript;
      setDescription(`${script.hookLine}\n\n${script.hashtags.map((h) => `#${h.replace(/[^A-Za-z0-9]/g, '')}`).join(' ')}`);
    }
  }, [project, description]);

  if (!project) return <Screen><Empty title="Project not found" /></Screen>;

  const persist = () =>
    updateProject(project.id, {
      publish: { title, description, tags, privacyStatus: privacy },
    });

  const signIn = async () => {
    if (!clientId.trim()) {
      Alert.alert('Client ID required', 'Paste your Google OAuth Android client ID first.');
      return;
    }
    try {
      await setKey('youtubeClientId', clientId.trim());
      const tokens = await authorize(clientId.trim());
      await setKey('youtubeTokens', JSON.stringify(tokens));
      setSignedIn(true);
      Alert.alert('Signed in', 'This device can now publish to your channel.');
    } catch (e) {
      Alert.alert('Sign-in failed', e instanceof Error ? e.message : String(e));
    }
  };

  const publish = async () => {
    if (!project.assets.finalVideo) {
      Alert.alert('Nothing to publish', 'Assemble the video first.');
      return;
    }

    const raw = await getKey('youtubeTokens');
    const storedClientId = await getKey('youtubeClientId');
    if (!raw || !storedClientId) {
      Alert.alert('Not signed in', 'Sign in to YouTube first.');
      return;
    }

    persist();
    setUploading(true);
    setProgress(0);

    try {
      const fresh = await ensureFreshToken(storedClientId, JSON.parse(raw) as StoredTokens);
      await setKey('youtubeTokens', JSON.stringify(fresh));

      const videoId = await uploadVideo(
        fresh.accessToken,
        project.assets.finalVideo,
        {
          title,
          description,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          privacyStatus: privacy,
        },
        setProgress
      );

      patchAssets(project.id, { youtubeVideoId: videoId });

      // A rejected thumbnail should not read as a failed upload — the video is live either way.
      if (project.assets.thumbnail) {
        try {
          await setThumbnail(fresh.accessToken, videoId, project.assets.thumbnail);
        } catch (e) {
          Alert.alert('Uploaded, thumbnail skipped', e instanceof Error ? e.message : String(e));
        }
      }

      Alert.alert('Published', `Video is live as ${privacy}.`, [
        { text: 'OK' },
        { text: 'Open on YouTube', onPress: () => void Linking.openURL(watchUrl(videoId)) },
      ]);
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Screen>
      <Card>
        <H2>Publish</H2>
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>YouTube Data API v3 · resumable upload</Small>
          <Badge label={signedIn ? 'SIGNED IN' : 'SIGNED OUT'} tone={signedIn ? 'ok' : 'neutral'} />
        </Row>
      </Card>

      {!signedIn ? (
        <Card>
          <H3>Connect your channel</H3>
          <Small>
            Create an OAuth client of type Android in Google Cloud Console, with package name
            com.mindfiles.studio, then paste its client ID. Android clients issue no secret, so nothing
            sensitive is stored in the app.
          </Small>
          <Field
            label="Android OAuth client ID"
            value={clientId}
            onChangeText={setClientId}
            placeholder="xxxxx.apps.googleusercontent.com"
            autoCapitalize="none"
          />
          <Button label="Sign in with Google" onPress={signIn} />
        </Card>
      ) : null}

      <Card>
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label="Description" value={description} onChangeText={setDescription} multiline />
        <Field label="Tags (comma separated)" value={tags} onChangeText={setTags} autoCapitalize="none" />

        <Small style={{ marginBottom: space.xs }}>Privacy</Small>
        <Segmented
          value={privacy}
          onChange={setPrivacy}
          options={[
            { value: 'private', label: 'Private' },
            { value: 'unlisted', label: 'Unlisted' },
            { value: 'public', label: 'Public' },
          ]}
        />
      </Card>

      {uploading ? (
        <Card>
          <H3>Uploading</H3>
          <ProgressBar fraction={progress} />
          <Small>{Math.round(progress * 100)}%</Small>
        </Card>
      ) : null}

      <Button
        label={project.assets.youtubeVideoId ? 'Publish again' : '🚀 Publish to YouTube'}
        onPress={publish}
        loading={uploading}
        disabled={!signedIn || !project.assets.finalVideo}
      />

      {project.assets.youtubeVideoId ? (
        <Card>
          <Small style={{ color: colors.ok }}>Live: {watchUrl(project.assets.youtubeVideoId)}</Small>
          <Button
            label="Open on YouTube"
            variant="secondary"
            onPress={() => void Linking.openURL(watchUrl(project.assets.youtubeVideoId!))}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

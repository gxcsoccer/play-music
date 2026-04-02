import { MusicProvider, Song, SourceName } from './types.js';

const providers = new Map<SourceName, MusicProvider>();

export function register(provider: MusicProvider) {
  providers.set(provider.name, provider);
}

export function getProvider(name: SourceName): MusicProvider | undefined {
  return providers.get(name);
}

export function getAllProviders(): MusicProvider[] {
  return [...providers.values()];
}

export function getSourceNames(): SourceName[] {
  return [...providers.keys()];
}

export async function searchAll(
  keyword: string,
  sources?: SourceName[],
  limit?: number,
): Promise<Song[]> {
  const targets = sources ?? getSourceNames();
  const results = await Promise.allSettled(
    targets
      .map(src => providers.get(src))
      .filter((p): p is MusicProvider => p !== undefined)
      .map(p => p.search(keyword, limit)),
  );
  return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
}

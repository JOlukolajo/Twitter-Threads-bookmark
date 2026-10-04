import { describe, expect, it } from 'vitest';
import xBookmarks from './fixtures/x-bookmarks.json';
import xEnd from './fixtures/x-bookmarks-end.json';
import xFolders from './fixtures/x-folders.json';
import threadsSaved from './fixtures/threads-saved.json';
import { xParser, threadsParser, parseJsonLoose } from '../src';

describe('X parser', () => {
  const page = xParser.parseTimeline(xBookmarks);

  it('parses tweets, cursors and skips tombstones', () => {
    expect(page.posts.map((p) => p.platformId)).toEqual(['1850000000000000001', '1849000000000000000']);
    expect(page.entryCount).toBe(3);
    expect(page.bottomCursor).toBe('BOTTOMCURSOR');
    expect(page.topCursor).toBe('TOPCURSOR');
  });

  it('expands links, strips media links, decodes entities', () => {
    expect(page.posts[0].text).toBe('Shipping & learning https://example.com/post');
  });

  it('reads the new user core fields and avatar location', () => {
    expect(page.posts[0].author).toMatchObject({ handle: 'ada', name: 'Ada Lovelace', verified: true });
    expect(page.posts[0].author.avatarUrl).toContain('_bigger.');
    expect(page.posts[0].url).toBe('https://x.com/ada/status/1850000000000000001');
  });

  it('picks original-size images and the highest-bitrate mp4', () => {
    const [img, vid] = page.posts[0].media;
    expect(img).toMatchObject({ type: 'image', url: 'https://pbs.twimg.com/media/AAA?format=jpg&name=orig' });
    expect(vid).toMatchObject({ type: 'video', url: 'https://video.twimg.com/high.mp4' });
    expect(page.posts[1].media[0]).toMatchObject({ type: 'gif', url: 'https://video.twimg.com/tweet_video/CCC.mp4' });
  });

  it('uses note tweet text, unwraps visibility results, parses quotes', () => {
    expect(page.posts[1].text).toBe('A very long note tweet that goes past 280 characters.');
    expect(page.posts[0].quoted).toMatchObject({ platformId: '1840000000000000000', text: 'Original thought' });
    expect(page.posts[0].quoted?.author.handle).toBe('grace');
  });

  it('derives the timestamp from the snowflake id and keeps sortIndex', () => {
    expect(page.posts[0].postedAt).toBe(xParser.snowflakeToMs('1850000000000000001'));
    expect(page.posts[0].postedAt).toBeGreaterThan(Date.UTC(2024, 0, 1));
    expect(page.posts[0].sortIndex).toBe('1850000000000000999');
  });

  it('detects the end of the timeline', () => {
    const end = xParser.parseTimeline(xEnd);
    expect(end.entryCount).toBe(0);
    expect(end.posts).toEqual([]);
  });

  it('collects tweets anywhere in a response (for live capture)', () => {
    expect(xParser.collectTweets(xBookmarks).map((p) => p.platformId)).toEqual(['1850000000000000001', '1849000000000000000']);
  });

  it('parses bookmark folders and request metadata', () => {
    expect(xParser.parseBookmarkFolders(xFolders).folders).toEqual([
      { externalId: '1700000000000000001', name: 'Design' },
      { externalId: '1700000000000000002', name: 'Startups' },
    ]);
    expect(xParser.xOperationName('https://x.com/i/api/graphql/abc123/Bookmarks?variables=%7B%7D')).toBe('Bookmarks');
    const url = 'https://x.com/i/api/graphql/q/Bookmarks?variables=' + encodeURIComponent(JSON.stringify({ count: 20, cursor: 'C' }));
    expect(xParser.xRequestVariables(url)).toEqual({ count: 20, cursor: 'C' });
    expect(xParser.xRequestVariables('https://x.com/i/api/graphql/q/CreateBookmark', JSON.stringify({ variables: { tweet_id: '5' } }))).toEqual({ tweet_id: '5' });
  });
});

describe('Threads parser', () => {
  const posts = threadsParser.collectThreadsPosts(threadsSaved);

  it('collects top-level posts only, in order', () => {
    expect(posts.map((p) => p.platformId)).toEqual(['DAbcDEF1', 'DAbcDEF2', 'DAbcDEF3']);
  });

  it('parses author, text, url, ids and time', () => {
    expect(posts[0]).toMatchObject({
      text: 'Hello Threads',
      extId: '3400000000000000001',
      url: 'https://www.threads.com/@zuck/post/DAbcDEF1',
      postedAt: 1727000000 * 1000,
    });
    expect(posts[0].author).toMatchObject({ handle: 'zuck', name: 'Mark', verified: true });
    expect(posts[1].text).toBe('Carousel post');
    expect(posts[1].author.name).toBe('mosseri');
  });

  it('picks the largest image, carousel items and videos', () => {
    expect(posts[0].media).toEqual([expect.objectContaining({ type: 'image', url: 'https://scontent.cdninstagram.com/large.jpg' })]);
    expect(posts[1].media.map((m) => m.type)).toEqual(['image', 'video']);
    expect(posts[1].media[1]).toMatchObject({ url: 'https://scontent.cdninstagram.com/c2.mp4', previewUrl: 'https://scontent.cdninstagram.com/c2poster.jpg' });
    expect(posts[2].media).toEqual([]);
  });

  it('attaches quoted posts instead of collecting them', () => {
    expect(posts[0].quoted).toMatchObject({ platformId: 'QUOTED1', text: 'quoted text' });
  });

  it('reads page info and save actions', () => {
    expect(threadsParser.threadsPageInfo(threadsSaved)).toEqual({ endCursor: 'CURSOR_A', hasNextPage: true });
    expect(threadsParser.threadsSaveAction('https://www.threads.com/api/v1/media/123_99/unsave/')).toEqual({ action: 'unsave', mediaId: '123' });
    const body = new URLSearchParams({ fb_api_req_friendly_name: 'useTHSavePostMutation', variables: JSON.stringify({ media_id: '77' }) }).toString();
    expect(threadsParser.threadsSaveAction('https://www.threads.com/graphql/query', body)).toEqual({ action: 'save', mediaId: '77' });
    const listBody = new URLSearchParams({ fb_api_req_friendly_name: 'BarcelonaSavedPostsQuery' }).toString();
    expect(threadsParser.threadsSaveAction('https://www.threads.com/graphql/query', listBody)).toBeNull();
  });

  it('parses loose JSON bodies', () => {
    expect(parseJsonLoose('for (;;);{"a":1}')).toEqual([{ a: 1 }]);
    expect(parseJsonLoose('{"a":1}\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

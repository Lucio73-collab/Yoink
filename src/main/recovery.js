/**
 * Known failures and their fixes. Each strategy is tried at most once per job,
 * in order.
 */

export const STRATEGIES = [
  {
    id: 'bot-check',
    match: /sign in to confirm|not a bot|LOGIN_REQUIRED|confirm you'?re not/i,
    title: 'YouTube bot check',
    // Cookies alone often fail here: YouTube checks proof of origin as well
    // as the session. Changing the playback client clears it more reliably.
    explain: 'YouTube wanted proof the request came from a real browser.',
    action: 'Retried as a different YouTube client',
    args(settings) {
      // The tv client can invalidate the session cookies were exported from,
      // so only use it when no cookies are configured.
      const usingCookies = settings.cookiesFrom && settings.cookiesFrom !== 'none'
      return [
        '--extractor-args',
        usingCookies
          ? 'youtube:player_client=web_safari,android'
          : 'youtube:player_client=tv,web_safari'
      ]
    }
  },

  {
    id: 'filename-long',
    match: /file ?name too long|errno 36|unable to open for writing|no such file or directory.*\.part/i,
    title: 'Filename too long',
    // Long titles plus non-ASCII characters blow past the filesystem limit,
    // because a limit measured in bytes is not a limit measured in characters.
    // Windows compounds it with a 260 character path ceiling.
    explain: 'The title was too long for the filesystem once encoded.',
    action: 'Retried with a shortened filename',
    args() {
      return ['-o', '%(title).60B [%(id)s].%(ext)s', '--trim-filenames', '120']
    }
  },

  {
    id: 'rate-limit',
    match: /http error 429|too many requests|rate.?limit|temporarily blocked/i,
    title: 'Rate limited',
    explain: 'The site asked us to slow down.',
    action: 'Retried more slowly',
    args() {
      return [
        '--sleep-requests', '2',
        '--sleep-interval', '5',
        '--max-sleep-interval', '15',
        '--limit-rate', '2M'
      ]
    }
  },

  {
    id: 'format-missing',
    match: /requested format (is )?not available|no video formats found|format not available/i,
    title: 'Format unavailable',
    explain: 'The exact quality asked for did not exist for this video.',
    action: 'Retried with the best available format',
    args() {
      return ['-f', 'bv*+ba/b']
    }
  },

  {
    id: 'po-token',
    match: /po.?token|missing.*formats|sabr|only images are available/i,
    title: 'Missing formats',
    explain: 'YouTube withheld the good formats from an unverified session.',
    action: 'Retried as a different client',
    args() {
      return ['--extractor-args', 'youtube:player_client=web_safari,tv']
    }
  },

  {
    id: 'fragment',
    match: /fragment .* not found|unable to download fragment|incomplete/i,
    title: 'Broken fragments',
    explain: 'Parts of the stream failed to transfer.',
    action: 'Retried with more patience and fewer parallel parts',
    args() {
      return ['--fragment-retries', '25', '--concurrent-fragments', '1', '--retry-sleep', '3']
    }
  },

  {
    id: 'ssl',
    match: /certificate verify failed|ssl:|tlsv1|unable to get local issuer/i,
    title: 'TLS error',
    explain: 'The secure connection could not be verified.',
    action: 'Retried over IPv4',
    args() {
      return ['--force-ipv4']
    }
  }
]

/**
 * Terminal failures. Retrying these wastes the user's time, so the queue
 * should stop and say plainly what happened.
 */
const FATAL = [
  { match: /private video|this video is private/i, message: 'That video is private.' },
  { match: /video unavailable|has been removed|no longer available/i, message: 'That video is no longer available.' },
  { match: /members-only|join this channel/i, message: 'Members-only. Turn on cookies in Settings for an account that has access.' },
  { match: /age.?restricted|confirm your age|inappropriate/i, message: 'Age restricted. Turn on cookies in Settings for a signed-in account.' },
  // YouTube's real wording is "has not made this video available in your country",
  // so match the tail of the phrase rather than an exact sentence.
  { match: /geo.?restricted|available in your country|blocked it in your country|not available from your location/i, message: 'Blocked in your country. A proxy in Settings would be needed.' },
  { match: /copyright grounds|removed by the uploader/i, message: 'Taken down at the source.' },
  { match: /unsupported url|no suitable extractor/i, message: 'That site is not supported.' },
  { match: /no space left|disk full|errno 28/i, message: 'The drive is full.' },
  { match: /permission denied|errno 13|access is denied/i, message: 'No permission to write there. Pick a different folder in Settings.' },
  { match: /is not a valid url|invalid url/i, message: 'That does not look like a valid link.' }
]

/** True when retrying cannot possibly help. */
export function fatalReason(text) {
  const hit = FATAL.find((f) => f.match.test(text))
  return hit ? hit.message : null
}

/**
 * Picks the next fix worth trying, skipping any already attempted.
 * Returns null when nothing applies, or when the failure is terminal.
 */
export function nextStrategy(errorText, tried = []) {
  const text = String(errorText || '')
  if (fatalReason(text)) return null
  return STRATEGIES.find((s) => !tried.includes(s.id) && s.match.test(text)) || null
}

/**
 * Turns raw yt-dlp output into something a person can act on. Falls back to
 * the original text rather than hiding information we failed to classify.
 */
export function explain(errorText) {
  const text = String(errorText || '').trim()
  if (!text) return 'Download failed for an unknown reason.'

  const fatal = fatalReason(text)
  if (fatal) return fatal

  const known = STRATEGIES.find((s) => s.match.test(text))
  if (known) return known.explain

  // Strip yt-dlp's prefix and the boilerplate link it appends to bot errors.
  const cleaned = text
    .replace(/^ERROR:\s*/i, '')
    .replace(/\s*See\s+https?:\/\/\S+/gi, '')
    .replace(/\s*Use --cookies-from-browser.*$/i, '')
    .trim()

  return cleaned.length > 200 ? `${cleaned.slice(0, 200)}...` : cleaned
}

/**
 * Bulk downloads are the fastest way to get flagged by YouTube. When a lot of
 * items are queued at once, spacing the requests out preemptively is far
 * cheaper than getting rate limited halfway through and recovering.
 */
export function throttleArgs(queuedCount) {
  if (queuedCount < 15) return []
  const heavy = queuedCount >= 40
  return [
    '--sleep-requests', heavy ? '2' : '1',
    '--sleep-interval', heavy ? '4' : '2',
    '--max-sleep-interval', heavy ? '12' : '6'
  ]
}

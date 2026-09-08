export const SITE_REPOSITORY = 'naz1234/cloudflare_Railog';
export const SITE_REPOSITORY_URL = `https://github.com/${SITE_REPOSITORY}`;

export function normalizeMergedUpdates(pulls) {
  if (!Array.isArray(pulls)) throw new Error('Invalid GitHub response');

  const seen = new Set();
  return pulls
    .filter((pull) => {
      if (!pull || pull.base?.ref !== 'main' || !pull.merged_at
        || !Number.isFinite(Date.parse(pull.merged_at))
        || !Number.isSafeInteger(pull.number) || pull.number < 1
        || seen.has(pull.number)) return false;
      seen.add(pull.number);
      return true;
    })
    .map((pull) => ({
      number: pull.number,
      title: String(pull.title || `Update #${pull.number}`).slice(0, 300),
      description: String(pull.body_text || pull.body || '').slice(0, 8000),
      mergedAt: pull.merged_at,
      commit: /^[a-f0-9]{40}$/i.test(pull.merge_commit_sha || '') ? pull.merge_commit_sha : '',
      url: `${SITE_REPOSITORY_URL}/pull/${pull.number}`,
    }))
    .sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt) || b.number - a.number);
}

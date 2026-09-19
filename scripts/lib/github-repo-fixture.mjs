export function publicRepositoryFixture(url, owner = 'bob') {
  const first = /\/(one|1001)$/.test(new URL(String(url)).pathname);
  const name = first ? 'one' : 'two';
  return { id: first ? 1001 : 1002, private: false, full_name: `${owner}/${name}`, name,
    html_url: `https://github.com/${owner}/${name}`, owner: { id: 200, login: owner } };
}

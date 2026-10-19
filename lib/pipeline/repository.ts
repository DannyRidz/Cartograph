export interface PublicRepository {
  owner: string;
  name: string;
  url: string;
}

export function publicRepository(input: string): PublicRepository {
  let url: URL;
  try { url = new URL(input.trim()); }
  catch { throw new Error("Enter a public GitHub repository URL."); }
  const match = /^\/([a-z\d](?:[a-z\d-]*[a-z\d])?)\/([a-z\d._-]+)\/?$/i.exec(url.pathname);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password
    || url.search || url.hash || !match) throw new Error("Enter an HTTPS GitHub URL containing only the owner and repository.");
  const owner = match[1].toLowerCase();
  const name = match[2].replace(/\.git$/i, "").toLowerCase();
  if (!name || name === "." || name === "..") throw new Error("Enter a valid GitHub repository name.");
  return { owner, name, url: `https://github.com/${owner}/${name}` };
}

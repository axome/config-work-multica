// Fichiers partagés dans Monday → pièces jointes multica.
// À l'import : joints à l'issue, puis placés sous leur message dans la description.
// Au suivi : joints au commentaire « Mise à jour Monday » qui annonce le nouveau message.
// La métadonnée `monday_asset_refs` (identifiant Monday → référence Markdown, ou « commentaire ») évite de joindre
// deux fois le même fichier.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Asset } from './monday.ts';
import { attachFiles, setMetadata, type ImportedIssue } from './multica.ts';

const MAX_SIZE = 20 * 1024 * 1024;
const MAX_FILES = 20;
const ALLOWED = /^(png|jpe?g|gif|webp|heic|bmp|svg|pdf|xlsx?|csv|tsv|txt|log|json|xml|docx?|pptx?|odt|ods|mp4|mov|webm)$/i;

/** Fichiers déjà joints : identifiant Monday → référence Markdown (description) ou « commentaire ». */
export type AssetRefs = Record<string, string>;

export function storedRefs(issue: Pick<ImportedIssue, 'metadata'>): AssetRefs {
  try {
    return JSON.parse(String(issue.metadata?.monday_asset_refs ?? '{}')) as AssetRefs;
  } catch {
    return {};
  }
}

/** Raison pour laquelle un fichier n'est pas joint, ou undefined s'il peut l'être. */
export function skipReason(asset: Asset): string | undefined {
  if (!ALLOWED.test(asset.ext)) return `type .${asset.ext || '?'} non joint`;
  if (asset.size > MAX_SIZE) return `${Math.round(asset.size / 1024 / 1024)} Mo, trop lourd`;
  if (!asset.url) return 'lien de téléchargement absent';
  return undefined;
}

/** Télécharge un fichier Monday, avec deux nouvelles tentatives espacées en cas d'échec (réseau, S3). */
async function fetchWithRetry(url: string): Promise<Buffer> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      if (!body.length) throw new Error('fichier vide');
      return body;
    } catch (err) {
      last = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

type Downloaded = { files: { asset: Asset; path: string }[]; skipped: string[]; cleanup: () => void };

/** Télécharge les fichiers pas encore joints et autorisés, dans un dossier temporaire à nettoyer ensuite. */
async function download(assets: Asset[], known: AssetRefs, dry: boolean): Promise<Downloaded & { eligible: number }> {
  const skipped: string[] = [];
  const unique = [...new Map(assets.map((a) => [a.id, a])).values()].filter((a) => !known[a.id]);
  const eligible = unique.filter((a) => {
    const why = skipReason(a);
    if (why) skipped.push(`${a.name} (${why})`);
    return !why;
  });
  const batch = eligible.slice(0, Math.max(0, MAX_FILES - Object.keys(known).length));
  for (const a of eligible.slice(batch.length)) skipped.push(`${a.name} (au-delà de ${MAX_FILES} fichiers)`);
  if (!batch.length || dry) return { files: [], skipped, cleanup: () => {}, eligible: batch.length };

  const dir = mkdtempSync(join(tmpdir(), 'build-tickets-'));
  const files: Downloaded['files'] = [];
  for (const [i, a] of batch.entries()) {
    try {
      const body = await fetchWithRetry(a.url);
      // Un sous-dossier par fichier : deux fichiers Monday peuvent porter le même nom, et le nom d'origine reste visible.
      const sub = join(dir, String(i + 1));
      mkdirSync(sub);
      const path = join(sub, a.name.replace(/[/\\]/g, '_'));
      writeFileSync(path, body);
      files.push({ asset: a, path });
    } catch (err) {
      skipped.push(`${a.name} (téléchargement impossible : ${(err as Error).message})`);
    }
  }
  return { files, skipped, cleanup: () => rmSync(dir, { recursive: true, force: true }), eligible: batch.length };
}

/**
 * Joint à l'issue (description) les fichiers pas encore joints, et renvoie toutes les références.
 * En essai à blanc, rien n'est téléchargé ni joint.
 */
export async function attachAssets(issueId: string, assets: Asset[], known: AssetRefs, dry: boolean): Promise<{ refs: AssetRefs; added: number; skipped: string[] }> {
  const refs = { ...known };
  const { files, skipped, cleanup, eligible } = await download(assets, refs, dry);
  if (dry) return { refs, added: eligible, skipped };
  try {
    if (files.length) {
      const newRefs = attachFiles(issueId, files.map((f) => f.path));
      files.forEach((f, i) => {
        if (newRefs[i]) refs[f.asset.id] = newRefs[i];
      });
      setMetadata(issueId, 'monday_asset_refs', JSON.stringify(refs));
    }
    return { refs, added: files.length, skipped };
  } finally {
    cleanup();
  }
}

/**
 * Prépare les fichiers d'un commentaire : chemins locaux à joindre, puis `commit()` une fois le commentaire posté
 * (mémorise ces fichiers comme joints et nettoie le dossier temporaire), ou `cleanup()` s'il n'est pas posté.
 */
export async function filesForComment(issueId: string, assets: Asset[], known: AssetRefs) {
  const { files, skipped, cleanup } = await download(assets, known, false);
  return {
    paths: files.map((f) => f.path),
    skipped,
    cleanup,
    commit: () => {
      if (files.length) {
        const refs = { ...known, ...Object.fromEntries(files.map((f) => [f.asset.id, 'commentaire'])) };
        setMetadata(issueId, 'monday_asset_refs', JSON.stringify(refs));
      }
      cleanup();
    },
  };
}

/** Lignes Markdown d'une liste de fichiers : la pièce jointe si elle est dans la description, sinon le nom et la raison. */
export function fileLines(assets: Asset[], refs: AssetRefs = {}): string[] {
  return assets.map((a) => {
    const ref = refs[a.id];
    if (ref && ref !== 'commentaire') return ref;
    if (ref === 'commentaire') return `- 📎 ${a.name} (joint au commentaire « Mise à jour Monday »)`;
    return `- 📎 ${a.name} (${skipReason(a) ?? 'pas encore joint, nouvel essai au prochain import'}, à voir dans Monday)`;
  });
}
